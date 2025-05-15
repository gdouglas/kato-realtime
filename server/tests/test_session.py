"""Tests for session management routes."""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

def test_create_session_success(client):
    """Test successful session creation."""
    # This mock_response simulates the direct response from OpenAI
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {
        "id": "sess_123",
        "expires_at": "2023-01-01T00:00:00Z",
        "client_secret": "mock_openai_client_secret_value"  # OpenAI directly returns the secret string
    }
    
    # Patch the httpx.AsyncClient.post call that our FastAPI route makes
    with patch("httpx.AsyncClient.post", return_value=mock_response):
        # Call our FastAPI endpoint (/api/v1/session)
        response = client.post("/api/v1/session")
        
        # Assertions for the response that OUR FastAPI endpoint returns
        assert response.status_code == 200
        data = response.json() # This is the JSON from our FastAPI endpoint
        
        # Our FastAPI endpoint should have formatted the client_secret
        assert "client_secret" in data
        assert isinstance(data["client_secret"], dict)
        assert "value" in data["client_secret"]
        assert data["client_secret"]["value"] == "mock_openai_client_secret_value" # Check the wrapped value
        
        # Check that other fields were passed through correctly by our FastAPI endpoint
        assert data.get("id") == "sess_123"
        assert data.get("expires_at") == "2023-01-01T00:00:00Z"

def test_create_session_api_error(client):
    """Test error handling when OpenAI API fails."""
    # Mock the httpx response for an error
    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.status_code = 401
    mock_response.reason_phrase = "Unauthorized"
    
    # Patch the httpx AsyncClient post method
    with patch("httpx.AsyncClient.post", return_value=mock_response):
        response = client.post("/api/v1/session")
        
        # Assertions
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        assert "OpenAI API error" in data["detail"] 