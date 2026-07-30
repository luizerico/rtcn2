/**
 * @module apiUtils
 * @description Utility functions for making secure requests to the backend API.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';

class ApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
        this.name = 'ApiError';
    }
}

function buildAuthHeaders(): HeadersInit {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    const token = localStorage.getItem('authToken');
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

/**
 * Handles generic GET requests to the backend.
 */
export async function apiGet<T>(endpoint: string): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: buildAuthHeaders(),
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
export async function apiPost<T>(endpoint: string, bodyData: object): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: buildAuthHeaders(),
            body: JSON.stringify(bodyData),
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