import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import apiRoutes from './api';

const app = express();

// Middleware

// A more explicit CORS configuration to handle preflight requests
const corsOptions = {
  origin: '*', // Allow all origins
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  preflightContinue: false,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Enable preflight for all routes

app.use(express.json({ limit: '10mb' })); // Allow larger payloads for images/audio

// API Routes
app.use('/api', apiRoutes);

// Global Error Handler
app.use(errorHandler);

export default app;
