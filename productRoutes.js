const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { validationResult, body } = require('express-validator');
const multer = require('multer');
const AWS = require('aws-sdk');

// Configure AWS SDK
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

// Multer memory storage configuration
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB file size limit
    },
    fileFilter: (req, file, cb) => {
        // Accept image files only
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// Validation middleware
const validateProduct = [
    body('itemName').trim().notEmpty().withMessage('Item name is required'),
    body('sellPrice').isFloat({ min: 0 }).withMessage('Sell price must be a positive number'),
    body('type').isIn(['Veg', 'Non-Veg', 'Beverage', 'Starter', 'Dessert', 'Breads']).withMessage('Invalid product type'),
    body('primaryUnit').optional().isIn(['piece', 'kg', 'gram', '']),
];

// Helper function to upload image to AWS S3
const uploadToS3 = async (file) => {
    if (!file) return null;

    try {
        // Generate a unique filename
        const filename = `products/${Date.now()}-${file.originalname}`;

        // S3 upload parameters
        const params = {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: filename,
            Body: file.buffer,
            ContentType: file.mimetype,
            ACL: 'public-read' // Makes the file publicly accessible
        };

        // Upload to S3
        const uploadResult = await s3.upload(params).promise();

        return uploadResult.Location; // Returns the public URL of the uploaded file
    } catch (error) {
        console.error('S3 upload error:', error);
        throw new Error('Image upload failed');
    }
};

// Create product route
router.post('/products', upload.single('image'), validateProduct, async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        // Upload image to S3 if exists
        const imageUrl = await uploadToS3(req.file);

        const { 
            itemName, 
            sellPrice, 
            type, 
            primaryUnit, 
            customUnit, 
            gstEnabled 
        } = req.body;

        // Calculate GST details
        const gstPercentage = gstEnabled === 'true' ? 5 : 0;
        const sellPriceFloat = parseFloat(sellPrice);
        const gstAmount = gstEnabled === 'true' 
            ? parseFloat((sellPriceFloat * 0.05).toFixed(2)) 
            : 0;
        const totalPrice = parseFloat((sellPriceFloat + gstAmount).toFixed(2));

        // Generate barcode (simple random method)
        const barcode = Math.floor(Math.random() * 1000000000000).toString();

        // Create new product
        const newProduct = new Product({
            itemName,
            sellPrice: sellPriceFloat,
            type,
            primaryUnit,
            customUnit,
            gstEnabled: gstEnabled === 'true',
            gstPercentage,
            gstAmount,
            totalPrice,
            barcode,
            imageUrl // Store S3 URL
        });

        // Save product
        const savedProduct = await newProduct.save();

        res.status(201).json({
            message: 'Product created successfully',
            product: savedProduct
        });
    } catch (error) {
        console.error('Product creation error:', error);
        res.status(400).json({
            error: 'Failed to create product',
            details: error.message
        });
    }
});

// Update product route with S3 image handling
router.put('/products/:id', upload.single('image'), validateProduct, async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const productId = req.params.id;

        // Find existing product
        const existingProduct = await Product.findById(productId);
        if (!existingProduct) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Upload new image if provided
        let imageUrl = existingProduct.imageUrl;
        if (req.file) {
            // If existing image, delete from S3 first
            if (existingProduct.imageUrl) {
                try {
                    const oldKey = existingProduct.imageUrl.split('/').slice(-2).join('/');
                    await s3.deleteObject({
                        Bucket: process.env.AWS_S3_BUCKET_NAME,
                        Key: oldKey
                    }).promise();
                } catch (deleteError) {
                    console.warn('Failed to delete old image:', deleteError);
                }
            }

            // Upload new image
            imageUrl = await uploadToS3(req.file);
        }

        const { 
            sellPrice, 
            type, 
            primaryUnit, 
            customUnit, 
            gstEnabled 
        } = req.body;

        // Calculate GST details
        const gstPercentage = gstEnabled === 'true' ? 5 : 0;
        const sellPriceFloat = parseFloat(sellPrice);
        const gstAmount = gstEnabled === 'true' 
            ? parseFloat((sellPriceFloat * 0.05).toFixed(2)) 
            : 0;
        const totalPrice = parseFloat((sellPriceFloat + gstAmount).toFixed(2));

        // Update product fields
        existingProduct.sellPrice = sellPriceFloat;
        existingProduct.type = type;
        existingProduct.primaryUnit = primaryUnit;
        existingProduct.customUnit = customUnit;
        existingProduct.gstEnabled = gstEnabled === 'true';
        existingProduct.gstPercentage = gstPercentage;
        existingProduct.gstAmount = gstAmount;
        existingProduct.totalPrice = totalPrice;
        existingProduct.imageUrl = imageUrl;

        // Save updated product
        const updatedProduct = await existingProduct.save();

        res.status(200).json({
            message: 'Product updated successfully',
            product: updatedProduct
        });
    } catch (error) {
        console.error('Product update error:', error);
        res.status(400).json({
            error: 'Failed to update product',
            details: error.message
        });
    }
});

// Delete product route with S3 image cleanup
router.delete('/products/:id', async (req, res) => {
    try {
        const productId = req.params.id;

        // Find the product to get the image URL
        const product = await Product.findById(productId);
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Delete image from S3 if exists
        if (product.imageUrl) {
            try {
                const oldKey = product.imageUrl.split('/').slice(-2).join('/');
                await s3.deleteObject({
                    Bucket: process.env.AWS_S3_BUCKET_NAME,
                    Key: oldKey
                }).promise();
            } catch (deleteError) {
                console.warn('Failed to delete image from S3:', deleteError);
            }
        }

        // Delete product from database
        const deletedProduct = await Product.findByIdAndDelete(productId);

        res.status(200).json({ 
            message: 'Product deleted successfully',
            product: deletedProduct 
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to delete product',
            details: error.message
        });
    }
});

// Get all products
router.get('/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.status(200).json(products);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to retrieve products',
            details: error.message
        });
    }
});

module.exports = router;