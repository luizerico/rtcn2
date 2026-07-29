/**
 * @module apiUtils
 * @description Utility functions for making secure requests to the backend API.
 */

// Base URL should match the deployment setup (e.g., localhost:5000)
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';

/**
 * Standardized response object for better type safety.
 * @template T The expected data structure of the successful response.
 */
interface ApiResponse<T> {
    data: T;
    message?: string;
}

// Custom error class for API failures
class ApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
        this.name = 'ApiError';
    }
}

/**
 * Handles generic GET requests to the backend.
 * @template T The expected return type of the API response data.
 * @param {string} endpoint - The API path (e.g., '/auth/login').
 * @param {Object} [body={}] - Optional body data for POST requests, although typically not used in GETs.
 * @returns {Promise<T>} The JSON response data.
 */
export async function apiGet<T>(endpoint: string, body?: Object): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;
    const token = localStorage.getItem('authToken');
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: headers,
            body: body ? JSON.stringify(body) : undefined // Only send body if provided
        });

        if (res.status === 401 || res.status === 403) {
             throw new ApiError('Unauthorized or Forbidden', res.status);
        } else if (!res.ok) {
            const errorData = await res.json();
            // Attempt to extract a user-friendly message from the API response
            const errorMessage = (errorData as { message: string }).message || `API request failed with status ${res.status}`;
            throw new ApiError(errorMessage, res.status);
        }

        return res.json() as Promise<T>;
    } catch (error) {
        console.error("API GET Error:", error);
        // Re-throw the error to allow calling components to handle it
        if (error instanceof ApiError) {
            throw error;
        }
        throw new Error('A network or unknown client error occurred.');
    }
}

/**
 * Handles generic POST requests to the backend.
 * @template T The expected return type of the API response data.
 * @param {string} endpoint - The API path (e.g., '/auth/login').
 * @param {Object} bodyData - The data payload for the request body.
 * @returns {Promise<T>} The JSON response data.
 */
export async function apiPost<T>(endpoint: string, bodyData: Object): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;
    const token = localStorage.getItem('authToken');
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(bodyData)
        });

        if (res.status === 401 || res.status === 403) {
             throw new ApiError('Unauthorized or Forbidden', res.status);
        } else if (!res.ok) {
            const errorData = await res.json();
            // Attempt to extract a user-friendly message from the API response
            const errorMessage = (errorData as { message: string }).message || `API request failed with status ${res.status}`;
            throw new ApiError(errorMessage, res.status);
        }

        return res.json() as Promise<T>;
    } catch (error) {
        console.error("API POST Error:", error);
        // Re-throw the error to allow calling components to handle it
        if (error instanceof ApiError) {
            throw error;
        }
        throw new Error('A network or unknown client error occurred.');
    }
}