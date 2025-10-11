
import { Request, Response, NextFunction } from 'express';

// FIX: Re-structured as a standard function declaration to resolve Express middleware type conflicts.
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
    // Since `err` can be anything, we should safely access its properties.
    const message = err instanceof Error ? err.message : 'An unknown error occurred.';
    const stack = err instanceof Error ? err.stack : undefined;

    console.error(stack || err);
    
    // You can add more specific error handling here based on error types
    
    res.status(500).json({
        success: false,
        message: 'An internal server error occurred.',
        error: message,
    });
}
