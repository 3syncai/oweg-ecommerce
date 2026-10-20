export const sellerArticles = [
  {
    slug: "prepare-your-first-listing", category: "Getting started", readingTime: 3,
    title: "Your first product listing, from details to review",
    excerpt: "A practical checklist for product information, photos and the documents to keep ready before you submit.",
    sections: [
      { title: "Start with a clear product identity", body: "Use the product's brand, model, type and defining features in its title. Choose the relevant category and describe the material, capacity or intended use where applicable. Check that the title and photos describe the same item." },
      { title: "Prepare the details customers need", body: "Include the correct variant options, stock quantity and pricing. Add clear product images. Keep the required brand authorization document ready; selecting a document in bulk upload prepares it for submission, while Submit saves the selected letter." },
      { title: "Measure the packed product", body: "Record the outer package length, width and height in centimetres and its total packed weight in kilograms. Include the box and protective packaging. These are the measurements used for package logistics." },
      { title: "Review before submitting", body: "Check your pricing, images and brand documents. Submission does not guarantee immediate publication: your vendor account, required documents and listing must complete the applicable review. Follow the status in Products after submission." },
    ],
  },
  {
    slug: "prepare-a-bulk-upload", category: "Bulk listing", readingTime: 4,
    title: "An Excel upload you can review with confidence",
    excerpt: "Prepare your sheet, check calculated listing prices and attach each brand letter before submitting.",
    sections: [
      { title: "Use the current template", body: "Download the template from Products > Bulk Upload. Use its mandatory field markings and supplied dropdowns. Keep product names, brands and category details consistent, and enter stock and packed measurements for each product." },
      { title: "Understand your base price", body: "The Excel MRP and discounted price describe your product base pricing. When a discounted price is supplied, it is used as the base selling price; otherwise the MRP is used. Select the tax code so its GST rate is applied consistently." },
      { title: "Review the proposed listing price", body: "After the sheet is accepted, review each product's listing price. The calculator adds the configured charges and estimated package logistics to suggest a listing price. Use View calculation to inspect the breakdown for that product, and edit the listing price if needed." },
      { title: "Finish photos and brand documents", body: "Match local image filenames to the sheet, or use valid product image URLs. Choose the authorization letter for each required brand. You can preview and edit the selected letter before Submit. Start over discards selections that have not been submitted." },
      { title: "Read any submission notices", body: "If Submit is disabled, read the listed reasons and complete the missing details. An unavailable shipping quote may need a logistics refresh or assistance. Submit only after you have reviewed all products; required approvals still apply afterward." },
    ],
  },
  {
    slug: "clear-product-photos", category: "Product presentation", readingTime: 3,
    title: "Product photos that answer the next question",
    excerpt: "Show the actual item clearly, with useful angles, details and a consistent first image.",
    sections: [
      { title: "Make the first image easy to understand", body: "Photograph the actual product against an uncluttered background with even lighting. Keep the whole item visible and sharp. Avoid adding claims or accessories that are not part of the purchase." },
      { title: "Show useful details", body: "Use additional photos for the back, controls, texture, included parts and packaging where relevant. If a product has variants, make sure the chosen colour or size is represented accurately. Show labels clearly without exposing private customer information." },
      { title: "Check every image before uploading", body: "Open each image to confirm it loads and is the correct product. If your Excel sheet refers to local files, keep the filenames consistent with the files you upload. Use images you own or have permission to use." },
      { title: "Review the preview", body: "Check the thumbnail in the listing review and open the product details before submission. Make sure the lead image is recognisable even at a small size and that the remaining images add useful information." },
    ],
  },
  {
    slug: "packed-dimensions-and-weight", category: "Package logistics", readingTime: 3,
    title: "Measure the package, not just the product",
    excerpt: "Use centimetres and kilograms to give package logistics the details it needs.",
    sections: [
      { title: "Pack it as you would ship it", body: "Use the shipping box, cushioning and included parts. Measure the outside of the final package. Measuring the bare product can understate the space or weight that the carrier needs to handle." },
      { title: "Use the right units", body: "Enter length, width and height in centimetres and packed weight in kilograms. For example, a package weighing 550 grams should be entered as 0.55 kilograms. Check that you have not entered millimetres as centimetres or grams as kilograms." },
      { title: "Check your store's pickup details", body: "Keep your vendor pickup address and pincode accurate. The shipping estimate uses the pickup location together with the packed measurements. Refresh logistics after changing those details." },
      { title: "Treat the amount as an estimate", body: "Carriers may assess actual or volumetric weight and apply their service rules. Review the package logistics amount in the product calculator. If no usable quote is available, refresh logistics or contact support rather than entering guessed measurements." },
    ],
  },
] as const
