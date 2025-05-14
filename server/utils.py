"""Utility functions for the Kato API Server."""

from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import time
import secrets
from typing import Dict, Any, Tuple
import logging

from config import get_settings, Settings

# Get module logger
logger = logging.getLogger(__name__)

# Security scheme for token authentication
security = HTTPBearer()

def create_token(data: Dict[str, Any], settings: Settings = Depends(get_settings)) -> Tuple[str, int]:
    """
    Create a new JWT token with expiration time
    
    Args:
        data: The data to include in the token
        settings: Application settings
        
    Returns:
        tuple: (token, expires_at)
    """
    to_encode = data.copy()
    expires_at = int(time.time()) + settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    to_encode.update({"exp": expires_at})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt, expires_at

def decode_token(token: str, settings: Settings = Depends(get_settings)):
    """
    Decode and validate a JWT token
    
    Args:
        token: The JWT token to validate
        settings: Application settings
        
    Returns:
        dict: The decoded token payload
        
    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        # Decode the token
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.ALGORITHM])
        
        # Check if token has expired
        if payload.get("exp") < int(time.time()):
            logger.warning(f"Token has expired: {payload.get('sub')}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        return payload
    except JWTError as e:
        logger.warning(f"Invalid token: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    settings: Settings = Depends(get_settings)
):
    """
    Dependency to verify token in the Authorization header
    
    Args:
        credentials: The HTTP authorization credentials
        settings: Application settings
        
    Returns:
        dict: The decoded token payload
    """
    if not credentials:
        logger.warning("Missing credentials")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    return decode_token(token, settings) 