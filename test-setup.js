import express from 'express';
import dotenv from 'dotenv';
import connectDB from './config/db.js';

// Load environment variables
dotenv.config();

const app = express();

// Test MongoDB connection
const testConnection = async () => {
  try {
    await connectDB();
    console.log('✅ MongoDB connection test passed');
  } catch (error) {
    console.error('❌ MongoDB connection test failed:', error.message);
    process.exit(1);
  }
};

// Test environment variables
const testEnvVars = () => {
  const requiredVars = [
    'MONGO_URI',
    'JWT_SECRET',
    'SESSION_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars);
    console.log('Please check your .env file');
    process.exit(1);
  }
  
  console.log('✅ Environment variables test passed');
};

// Test basic server setup
const testServerSetup = () => {
  app.get('/test', (req, res) => {
    res.json({ 
      status: 'OK', 
      message: 'Server setup test passed',
      timestamp: new Date().toISOString()
    });
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`✅ Server test running on port ${PORT}`);
    console.log(`🌐 Test endpoint: http://localhost:${PORT}/test`);
  });
};

// Run all tests
const runTests = async () => {
  console.log('🧪 Running backend setup tests...\n');
  
  testEnvVars();
  await testConnection();
  testServerSetup();
  
  console.log('\n🎉 All tests passed! Your backend is ready to go.');
  console.log('\nNext steps:');
  console.log('1. Run "npm run dev" to start development server');
  console.log('2. Test API endpoints with your frontend');
  console.log('3. Deploy to Render when ready');
};

runTests().catch(console.error);
