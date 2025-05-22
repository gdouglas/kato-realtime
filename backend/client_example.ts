/**
 * Example client implementation for the Token API in TypeScript
 */

// Define interfaces for our data structures
interface TokenData {
  token: string;
  expiresAt: number; // Assuming expires_at from API is a Unix timestamp (number)
}

interface ProtectedTokenData {
  sub: string;
  type: string;
  expires_at: number; // Assuming this is also a Unix timestamp
}

interface ProtectedResponse {
  message: string;
  token_data: ProtectedTokenData;
}

// Fetch a new token from the API
export async function getToken(): Promise<TokenData> {
  try {
    const response = await fetch('http://localhost:8000/api/v1/token', { // Updated URL
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get token: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    // Assuming the API returns 'expires_at', mapping to 'expiresAt' for consistency if needed,
    // or ensure your API returns 'expiresAt' directly if you prefer.
    // For this example, let's assume the API response directly matches:
    // { token: "some_token", expires_at: 1678886400 }
    return {
      token: data.token,
      expiresAt: data.expires_at 
    };
  } catch (error) {
    console.error('Error getting token:', error);
    throw error; // Re-throw to allow caller to handle
  }
}

// Make a request to a protected endpoint
export async function accessProtectedEndpoint(token: string): Promise<ProtectedResponse> {
  try {
    const response = await fetch('http://localhost:8000/api/v1/protected', { // Updated URL
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to access protected endpoint: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    return data as ProtectedResponse; // Asserting the type of the response
  } catch (error) {
    console.error('Error accessing protected endpoint:', error);
    throw error; // Re-throw
  }
}

// Example usage in a Next.js/React component (TypeScript)
/*
import { useState, useEffect } from 'react';
import { getToken, accessProtectedEndpoint } from '@/utils/client_example'; // Assuming you move this file

interface TokenExampleProps {}

export default function TokenExample({}: TokenExampleProps): JSX.Element {
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [protectedData, setProtectedData] = useState<ProtectedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Get token on component mount
  useEffect(() => {
    async function fetchToken() {
      try {
        const fetchedTokenData = await getToken();
        setTokenData(fetchedTokenData);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch token');
      }
    }
    
    fetchToken();
  }, []);
  
  // Function to access protected endpoint
  async function handleAccessProtected() {
    if (!tokenData?.token) {
      setError('Token not available.');
      return;
    }
    
    try {
      setError(null); // Clear previous errors
      const data = await accessProtectedEndpoint(tokenData.token);
      setProtectedData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to access protected data');
    }
  }
  
  return (
    <div>
      <h1>Token Example (TypeScript)</h1>
      
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
      
      {tokenData ? (
        <div>
          <p>Token acquired! Expires at: {new Date(tokenData.expiresAt * 1000).toLocaleString()}</p>
          <button onClick={handleAccessProtected} disabled={!tokenData.token}>
            Access Protected Endpoint
          </button>
        </div>
      ) : (
        <p>Fetching token...</p>
      )}
      
      {protectedData && (
        <div>
          <h2>Protected Data</h2>
          <pre>{JSON.stringify(protectedData, null, 2)}</pre>
          <p>Message: {protectedData.message}</p>
          <p>Token Subject: {protectedData.token_data.sub}</p>
          <p>Token Type: {protectedData.token_data.type}</p>
          <p>Token Expires: {new Date(protectedData.token_data.expires_at * 1000).toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}
*/

// If this file is intended to be a module providing these functions,
// the 'export' keyword on the functions themselves is sufficient.
// No need for a separate module.exports at the end in TypeScript. 