const mockHead = jest.fn();
const mockGet = jest.fn();
const mockCreate = jest.fn(() => ({ head: mockHead, get: mockGet }));

jest.mock("axios", () => ({
  __esModule: true,
  default: {
    create: mockCreate,
  },
  create: mockCreate,
  __mock: {
    head: mockHead,
    get: mockGet,
    create: mockCreate,
  },
}));

describe("resolveImageUrl", () => {
  const resetEnv = () => {
    process.env.OC_BASE_URL = "https://www.example.com";
    process.env.PLACEHOLDER_URL =
      "https://via.placeholder.com/800x800.png?text=Image+missing";
    process.env.HTTP_REFERER = "https://www.example.com/";
  };

  beforeEach(() => {
    jest.resetModules();
    mockHead.mockReset();
    mockGet.mockReset();
    mockCreate.mockReset();
    mockCreate.mockReturnValue({ head: mockHead, get: mockGet });
    resetEnv();
  });

  it("encodes spaces and reserved characters while validating the original URL", async () => {
    mockHead.mockResolvedValue({ headers: { "content-type": "image/jpeg" } });
    const { resolveImageUrl } = await import("../image-resolver");

    const result = await resolveImageUrl(
      "image/catalog/Pressure Cookers/My Image +#.jpg"
    );

    expect(result.url).toBe(
      "https://www.example.com/image/catalog/Pressure%20Cookers/My%20Image%20%2B%23.jpg"
    );
    expect(result.reason).toBe("original");
    expect(mockHead).toHaveBeenCalledWith(
      "https://www.example.com/image/catalog/Pressure%20Cookers/My%20Image%20%2B%23.jpg"
    );
  });

  it("falls back to OpenCart cache thumbnails when the source asset is missing", async () => {
    mockHead
      .mockRejectedValueOnce(new Error("404"))
      .mockResolvedValueOnce({ headers: { "content-type": "image/png" } });

    const { resolveImageUrl } = await import("../image-resolver");
    const result = await resolveImageUrl("image/catalog/tools/widget.png");

    expect(result.reason).toBe("cache");
    expect(result.url).toBe(
      "https://www.example.com/image/cache/catalog/tools/widget-1000x1000.png"
    );
    expect(mockHead).toHaveBeenCalledTimes(2);
  });

  it("returns the configured placeholder when no valid image URLs respond with image/*", async () => {
    mockHead.mockResolvedValue({ headers: { "content-type": "text/html" } });
    const { resolveImageUrl, placeholderUrl } = await import("../image-resolver");

    const result = await resolveImageUrl("image/catalog/unknown/item.bmp");

    expect(result.reason).toBe("placeholder");
    expect(result.url).toBe(placeholderUrl());
    expect(mockHead).toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });
});
