import logger from '../utils/logger.js';

export class ErrorResponse extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

export const errorHandler = (err, req, res, next) => {
    try {
        let error = { ...err };
        error.message = err?.message;

        // Log error safely
        logger.error('Error occurred', { 
            error: err?.message || 'Unknown error', 
            stack: err?.stack, 
            url: req?.url, 
            method: req?.method 
        });

        // Mongoose 404
        if (err?.name === 'CastError') {
            const message = `Resource not found with id of ${err?.value}`;
            error = new ErrorResponse(message, 404);
        }

        // Mongoose duplicate 400
        if (err?.code === 11000) {
            const message = 'Duplicate field value entered';
            error = new ErrorResponse(message, 400);
        }

        // Mongoose Validation 400
        if (err?.name === 'ValidationError') {
            const message = Object.values(err?.errors || {}).map(val => val.message).join(', ');
            error = new ErrorResponse(message, 400);
        }

        const statusCode = error?.statusCode || err?.statusCode || res.statusCode || 500;
        
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Server Error',
            error: err?.message || 'Server Error',
            stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack
        });
    } catch (criticalErr) {
        // Fallback for when the error handler ITSELF fails
        console.error("CRITICAL ERROR HANDLER FAILURE:", criticalErr);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Internal Server Error in Error Handler" });
        }
    }
};
