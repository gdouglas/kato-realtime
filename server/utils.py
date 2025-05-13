from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import time
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"

# Security scheme for token authentication
security = HTTPBearer()

def decode_token(token: str):
    """
    Decode and validate a JWT token
    
    Args:
        token: The JWT token to validate
        
    Returns:
        dict: The decoded token payload
        
    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        # Decode the token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Check if token has expired
        if payload.get("exp") < int(time.time()):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Dependency to verify token in the Authorization header
    
    Args:
        credentials: The HTTP authorization credentials
        
    Returns:
        dict: The decoded token payload
    """
    token = credentials.credentials
    return decode_token(token) 