/**
 * Example client implementation for the Token API
 */

// Fetch a new token from the API
async function getToken() {
  try {
    const response = await fetch('http://localhost:8000/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get token: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return {
      token: data.token,
      expiresAt: data.expires_at
    };
  } catch (error) {
    console.error('Error getting token:', error);
    throw error;
  }
}

// Make a request to a protected endpoint
async function accessProtectedEndpoint(token) {
  try {
    const response = await fetch('http://localhost:8000/api/protected', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to access protected endpoint: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error accessing protected endpoint:', error);
    throw error;
  }
}

// Example usage in Next.js component
/*
import { useState, useEffect } from 'react';
import { getToken, accessProtectedEndpoint } from '@/utils/tokenApi';

export default function TokenExample() {
  const [token, setToken] = useState(null);
  const [protectedData, setProtectedData] = useState(null);
  const [error, setError] = useState(null);
  
  // Get token on component mount
  useEffect(() => {
    async function fetchToken() {
      try {
        const tokenData = await getToken();
        setToken(tokenData);
      } catch (err) {
        setError(err.message);
      }
    }
    
    fetchToken();
  }, []);
  
  // Function to access protected endpoint
  async function handleAccessProtected() {
    if (!token) return;
    
    try {
      const data = await accessProtectedEndpoint(token.token);
      setProtectedData(data);
    } catch (err) {
      setError(err.message);
    }
  }
  
  return (
    <div>
      <h1>Token Example</h1>
      
      {error && <div className="error">{error}</div>}
      
      {token ? (
        <div>
          <p>Token acquired! Expires at: {new Date(token.expiresAt * 1000).toLocaleString()}</p>
          <button onClick={handleAccessProtected}>Access Protected Endpoint</button>
        </div>
      ) : (
        <p>Fetching token...</p>
      )}
      
      {protectedData && (
        <div>
          <h2>Protected Data</h2>
          <pre>{JSON.stringify(protectedData, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
*/

module.exports = {
  getToken,
  accessProtectedEndpoint
}; 