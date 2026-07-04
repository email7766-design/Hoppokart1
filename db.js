const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = 'business_mindset';

let client;
let db;

async function connectDB() {
  if (db) return db;
  
  try {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    console.log('✅ MongoDB connected');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    throw error;
  }
}

async function getProducts() {
  const database = await connectDB();
  return database.collection('products').find({}).toArray();
}

async function addProduct(product) {
  const database = await connectDB();
  return database.collection('products').insertOne(product);
}

async function updateProduct(id, product) {
  const database = await connectDB();
  return database.collection('products').updateOne(
    { _id: id },
    { $set: product }
  );
}

async function deleteProduct(id) {
  const database = await connectDB();
  return database.collection('products').deleteOne({ _id: id });
}

async function getCategories() {
  const database = await connectDB();
  return database.collection('categories').find({}).toArray();
}

async function addCategory(category) {
  const database = await connectDB();
  return database.collection('categories').insertOne({ name: category });
}

async function deleteCategory(name) {
  const database = await connectDB();
  return database.collection('categories').deleteOne({ name });
}

module.exports = {
  connectDB,
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  getCategories,
  addCategory,
  deleteCategory
};
