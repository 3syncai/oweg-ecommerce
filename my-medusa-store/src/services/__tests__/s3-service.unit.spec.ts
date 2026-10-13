import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { S3Service } from "../s3-service"

describe("marketing uploads after a bucket migration", () => {
  const names = ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_FILE_URL"]
  const saved = names.map((name) => process.env[name])

  afterEach(() => {
    jest.restoreAllMocks()
    names.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name]
      else process.env[name] = saved[index]
    })
  })

  it("returns the actual upload bucket for logos and banners when S3_FILE_URL is stale", async () => {
    Object.assign(process.env, {
      S3_BUCKET: "current-marketing-media",
      S3_REGION: "ap-south-1",
      S3_ACCESS_KEY_ID: "test-key",
      S3_SECRET_ACCESS_KEY: "test-secret",
      S3_FILE_URL: "https://retired-marketing-media.s3.ap-south-1.amazonaws.com",
    })
    const send = jest.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never)
    const service = new S3Service()
    const file = Buffer.from("test image")
    const logo = await service.uploadBrandLogo("Test Brand", file, "logo.png", "image/png")
    const banner = await service.uploadCategoryMegaMenuBanner("home-appliances", "banner", file, "banner.png", "image/png")

    for (const result of [logo, banner]) {
      const url = new URL(result.url)
      expect(url.hostname).toBe("current-marketing-media.s3.ap-south-1.amazonaws.com")
      expect(url.pathname.slice(1)).toBe(result.key)
    }
    expect(logo.url).toContain("?v=")
    expect(send).toHaveBeenCalledTimes(2)
    const uploads = send.mock.calls.map(([command]) => (command as PutObjectCommand).input)
    expect(uploads.every((input) => input.Bucket === "current-marketing-media")).toBe(true)
    expect(uploads[0].ContentType).toBe("image/png")
    expect(uploads[1].CacheControl).toBe("public, max-age=31536000, immutable")
  })
})
