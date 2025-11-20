import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireVendorAuth } from "../../_lib/guards"
import Busboy from "busboy"
import * as fs from "fs"
import * as path from "path"
import { randomUUID } from "node:crypto"

function ensureDirSync(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    // Verify vendor authentication
    const vendorId = await requireVendorAuth(req)
    if (!vendorId) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    const contentType =
      ((req as any).headers?.["content-type"] as string) ||
      ((req as any).headers?.["Content-Type"] as string) ||
      ""
    
    console.log("Upload request content-type:", contentType)
    console.log("Upload request headers:", (req as any).headers)

    // Don't enforce content-type check - let Busboy handle it
    // The browser sets it automatically with boundary for FormData

    const uploadsDir = path.join(process.cwd(), "public", "uploads", "products")
    ensureDirSync(uploadsDir)

    const headers = (req as any).headers || {}
    console.log("Creating Busboy with headers:", Object.keys(headers))

    const bb = Busboy({ headers })
    const results: Array<{ url: string; filename: string; originalName: string }> = []
    let fileCount = 0
    let pendingWrites = 0
    let busboyFinished = false

    const finished = new Promise<void>((resolve, reject) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          reject(new Error("Upload timeout - no files received within 30 seconds"))
        }
      }, 30000)

      const checkComplete = () => {
        // Only resolve when both Busboy is finished AND all file writes are complete
        if (busboyFinished && pendingWrites === 0 && !resolved) {
          console.log("All files processed and written. Total:", results.length)
          resolved = true
          clearTimeout(timeout)
          resolve()
        }
      }

      bb.on("file", (name: string, file: NodeJS.ReadableStream, info: { filename: string; encoding: string; mimeType: string }) => {
        console.log("File received:", name, info.filename, info.mimeType)
        fileCount++
        pendingWrites++
        const filename = (info.filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_")
        const extension = path.extname(filename)
        const basename = `${vendorId}-${Date.now()}-${randomUUID()}${extension}`
        const target = path.join(uploadsDir, basename)
        const out = fs.createWriteStream(target)

        file.pipe(out)

        out.on("finish", () => {
          const fileUrl = `/uploads/products/${basename}`
          results.push({
            url: fileUrl,
            filename: basename,
            originalName: filename,
          })
          console.log("File saved:", fileUrl)
          pendingWrites--
          checkComplete()
        })

        out.on("error", (err: any) => {
          console.error("File write error:", err)
          pendingWrites--
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            reject(err)
          }
        })

        file.on("error", (err: any) => {
          console.error("File stream error:", err)
          pendingWrites--
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            reject(err)
          }
        })
      })

      bb.on("field", (name: string, value: string) => {
        console.log("Field received:", name, value)
      })

      bb.on("error", (error: any) => {
        console.error("Busboy error:", error)
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          reject(error)
        }
      })

      bb.on("finish", () => {
        console.log("Busboy finished parsing. Files received:", fileCount, "Pending writes:", pendingWrites)
        busboyFinished = true
        checkComplete()
      })
    })

    // Try to access raw request stream
    // In Medusa, the request might be wrapped, so we need to access the underlying stream
    // Try multiple possible paths to the raw request
    let rawReq: any = req
    
    // Check if req has a raw property (common in some frameworks)
    if ((req as any).raw && typeof (req as any).raw.pipe === "function") {
      rawReq = (req as any).raw
    }
    // Check if req has a req property (Express-style wrapping)
    else if ((req as any).req && typeof (req as any).req.pipe === "function") {
      rawReq = (req as any).req
    }
    // Check if req itself is a stream
    else if (typeof (req as any).pipe === "function") {
      rawReq = req
    }
    // Try to access the underlying Node.js request
    else if ((req as any).socket && (req as any).socket.readable) {
      // If we can access the socket, we might be able to reconstruct the stream
      // But this is complex, so we'll return an error
      console.error("Request stream not directly accessible")
      return res.status(400).json({ 
        message: "Request stream not available. The request body may have been parsed already." 
      })
    }
    
    // Check if the stream is still readable (not consumed)
    if (rawReq && typeof rawReq.pipe === "function") {
      // Check if stream is already consumed
      if (rawReq.readable === false && rawReq.readableEnded === true) {
        console.error("Request stream already consumed")
        return res.status(400).json({ 
          message: "Request body has already been parsed. Cannot process multipart upload." 
        })
      }
      
      try {
        rawReq.pipe(bb)
      } catch (pipeError: any) {
        console.error("Error piping request to busboy:", pipeError)
        return res.status(400).json({ 
          message: "Failed to process request stream",
          error: pipeError.message 
        })
      }
    } else {
      console.error("Request does not have pipe method")
      return res.status(400).json({ message: "Request stream not available" })
    }
    
    await finished

    if (!results.length) {
      return res.status(400).json({ message: "no files received" })
    }

    return res.json({ files: results })
  } catch (error: any) {
    console.error("Error in image upload:", error)
    return res.status(500).json({
      message: "Failed to upload images",
      error: error.message,
    })
  }
}

