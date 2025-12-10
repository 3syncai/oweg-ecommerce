"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONS = OPTIONS;
exports.POST = POST;
const affiliate_1 = require("../../../../modules/affiliate");
const busboy_1 = __importDefault(require("busboy"));
const client_s3_1 = require("@aws-sdk/client-s3");
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
// CORS headers helper
function setCorsHeaders(res, req) {
    const origin = req?.headers.origin || '*';
    // When using credentials, we must specify the exact origin, not '*'
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}
async function OPTIONS(req, res) {
    setCorsHeaders(res, req);
    return res.status(200).end();
}
function getS3Config() {
    return {
        s3Region: process.env.S3_REGION?.trim() || "",
        s3AccessKeyId: process.env.S3_ACCESS_KEY_ID?.trim() || "",
        s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.trim() || "",
        s3Bucket: process.env.S3_BUCKET?.trim() || "",
    };
}
function sanitizeForPath(str) {
    return str
        .toLowerCase()
        .replace(/[^a-zA-Z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50) || 'user';
}
async function POST(req, res) {
    setCorsHeaders(res, req);
    try {
        const affiliateService = req.scope.resolve(affiliate_1.AFFILIATE_MODULE);
        // Check if it's multipart/form-data
        const contentType = (req.headers['content-type'] || '').toLowerCase();
        const isMultipart = contentType.includes('multipart/form-data');
        let formData = {};
        let uploadedFiles = {};
        if (isMultipart) {
            // Handle multipart/form-data with file uploads
            const { s3Region, s3AccessKeyId, s3SecretAccessKey, s3Bucket } = getS3Config();
            const s3FileUrl = process.env.S3_FILE_URL || `https://${s3Bucket}.s3.${s3Region}.amazonaws.com`;
            let s3Client = null;
            if (s3Bucket && s3AccessKeyId && s3SecretAccessKey && s3Region) {
                s3Client = new client_s3_1.S3Client({
                    region: s3Region,
                    credentials: {
                        accessKeyId: s3AccessKeyId,
                        secretAccessKey: s3SecretAccessKey,
                    },
                });
            }
            const headers = req.headers || {};
            const bb = (0, busboy_1.default)({ headers });
            const filePromises = [];
            let userName = '';
            let userEmail = '';
            await new Promise((resolve, reject) => {
                bb.on("field", (name, value) => {
                    if (name === "is_agent" || name === "agree_to_policy") {
                        formData[name] = value === "true";
                    }
                    else {
                        formData[name] = value;
                    }
                    if (name === "first_name" || name === "last_name") {
                        userName = (userName ? userName + " " : "") + value;
                    }
                    if (name === "email") {
                        userEmail = value;
                    }
                });
                bb.on("file", (name, file, info) => {
                    if (name === "aadhar_card_photo" || name === "pan_card_photo") {
                        const filePromise = (async () => {
                            if (!s3Client) {
                                console.warn("S3 not configured, skipping file upload");
                                return;
                            }
                            const filename = (info.filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
                            const extension = path_1.default.extname(filename) || '.png';
                            const uniqueId = (0, crypto_1.randomUUID)().substring(0, 8);
                            const imageFilename = `${uniqueId}${extension}`;
                            const sanitizedName = sanitizeForPath(userName || userEmail || "user");
                            const s3Key = `affiliate/users/${sanitizedName}/documents/${name}/${imageFilename}`;
                            const fileChunks = [];
                            file.on("data", (chunk) => fileChunks.push(chunk));
                            await new Promise((fileResolve, fileReject) => {
                                file.on("end", async () => {
                                    try {
                                        const fileBuffer = Buffer.concat(fileChunks);
                                        const command = new client_s3_1.PutObjectCommand({
                                            Bucket: s3Bucket,
                                            Key: s3Key,
                                            Body: fileBuffer,
                                            ContentType: info.mimeType || "image/png",
                                        });
                                        await s3Client.send(command);
                                        const fileUrl = `${s3FileUrl}/${s3Key}`;
                                        uploadedFiles[name] = fileUrl;
                                        fileResolve();
                                    }
                                    catch (err) {
                                        console.error(`Error uploading ${name}:`, err);
                                        fileReject(err);
                                    }
                                });
                                file.on("error", fileReject);
                            });
                        })();
                        filePromises.push(filePromise);
                    }
                });
                bb.on("finish", () => {
                    Promise.all(filePromises)
                        .then(() => resolve())
                        .catch(reject);
                });
                bb.on("error", reject);
                req.pipe(bb);
            });
        }
        else {
            // Handle JSON body
            formData = req.body || {};
        }
        const { first_name, last_name, email, password, confirm_password, phone, refer_code, entry_sponsor, is_agent, gender, father_name, mother_name, birth_date, qualification, marital_status, blood_group, emergency_person_name, emergency_person_mobile, aadhar_card_no, pan_card_no, designation, sales_target, branch, area, state, payment_method, bank_name, bank_branch, ifsc_code, account_name, account_number, address_1, address_2, city, pin_code, country, address_state, } = formData;
        // Validate required fields
        if (!first_name || !last_name || !email || !password) {
            return res.status(400).json({
                message: "First name, last name, email, and password are required",
            });
        }
        if (password !== confirm_password) {
            return res.status(400).json({
                message: "Passwords do not match",
            });
        }
        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters long",
            });
        }
        // Create affiliate user
        const affiliateUser = await affiliateService.createAffiliateUser({
            first_name,
            last_name,
            email,
            password,
            phone: phone || null,
            refer_code: refer_code || null,
            entry_sponsor: entry_sponsor || null,
            is_agent: is_agent || false,
            gender: gender || null,
            father_name: father_name || null,
            mother_name: mother_name || null,
            birth_date: birth_date || null,
            qualification: qualification || null,
            marital_status: marital_status || null,
            blood_group: blood_group || null,
            emergency_person_name: emergency_person_name || null,
            emergency_person_mobile: emergency_person_mobile || null,
            aadhar_card_no: aadhar_card_no || null,
            pan_card_no: pan_card_no || null,
            aadhar_card_photo: uploadedFiles.aadhar_card_photo || null,
            pan_card_photo: uploadedFiles.pan_card_photo || null,
            designation: designation || null,
            sales_target: sales_target || null,
            branch: branch || null,
            area: area || null,
            state: state || null,
            payment_method: payment_method || null,
            bank_name: bank_name || null,
            bank_branch: bank_branch || null,
            ifsc_code: ifsc_code || null,
            account_name: account_name || null,
            account_number: account_number || null,
            address_1: address_1 || null,
            address_2: address_2 || null,
            city: city || null,
            pin_code: pin_code || null,
            country: country || null,
            address_state: address_state || null,
        });
        // Remove password_hash from response
        const { password_hash, ...sanitizedUser } = affiliateUser;
        return res.json({
            user: sanitizedUser,
            message: "Affiliate user created successfully. Your application is pending verification.",
        });
    }
    catch (error) {
        console.error("Affiliate registration error:", error);
        if (error.type === "DUPLICATE_ERROR") {
            return res.status(409).json({
                message: error.message || "Email already exists",
            });
        }
        return res.status(500).json({
            message: "Failed to create affiliate user",
            error: error?.message || String(error),
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL2FmZmlsaWF0ZS9yZWdpc3Rlci9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQWtCQSwwQkFHQztBQW9CRCxvQkF3T0M7QUEvUUQsNkRBQWdFO0FBQ2hFLG9EQUEyQjtBQUMzQixrREFBK0Q7QUFDL0QsZ0RBQXVCO0FBQ3ZCLG1DQUFtQztBQUVuQyxzQkFBc0I7QUFDdEIsU0FBUyxjQUFjLENBQUMsR0FBbUIsRUFBRSxHQUFtQjtJQUM5RCxNQUFNLE1BQU0sR0FBRyxHQUFHLEVBQUUsT0FBTyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUE7SUFDekMsb0VBQW9FO0lBQ3BFLEdBQUcsQ0FBQyxTQUFTLENBQUMsNkJBQTZCLEVBQUUsTUFBTSxDQUFDLENBQUE7SUFDcEQsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFBO0lBQ2hGLEdBQUcsQ0FBQyxTQUFTLENBQUMsOEJBQThCLEVBQUUsb0RBQW9ELENBQUMsQ0FBQTtJQUNuRyxHQUFHLENBQUMsU0FBUyxDQUFDLGtDQUFrQyxFQUFFLE1BQU0sQ0FBQyxDQUFBO0FBQzNELENBQUM7QUFFTSxLQUFLLFVBQVUsT0FBTyxDQUFDLEdBQWtCLEVBQUUsR0FBbUI7SUFDbkUsY0FBYyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQTtJQUN4QixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUE7QUFDOUIsQ0FBQztBQUVELFNBQVMsV0FBVztJQUNsQixPQUFPO1FBQ0wsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUU7UUFDN0MsYUFBYSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLElB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