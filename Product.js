const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  itemName: {
    type: String,
    required: true,
    trim: true
  },
  sellPrice: {
    type: Number,
    required: true
  },
  primaryUnit: {
    type: String
  },
  customUnit: {
    type: String
  },
  type: {
    type: String,
    enum: ['Veg', 'Non-Veg','Beverage', 'Starter', 'Dessert', 'Breads'],
    default: 'Veg'
  },
  gstEnabled: {
    type: Boolean,
    default: false
  },
  totalPrice: {
    type: Number
  },
  imageUrl: {
    type: String,
    default: '' 
  }
}, { timestamps: true });

module.exports = mongoose.model('Product', ProductSchema);