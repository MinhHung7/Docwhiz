# auth.py
import os
import requests
from jose import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import dotenv

dotenv.load_dotenv()

security = HTTPBearer()

JWKS_URL = os.environ["SUPABASE_JWKS_URL"]
JWKS = requests.get(JWKS_URL).json()

def decode_token(token: str):
    try:
        headers = jwt.get_unverified_header(token)
        kid = headers["kid"]
        key = next((k for k in JWKS["keys"] if k["kid"] == kid), None)

        if not key:
            raise Exception("Matching key not found")

        return jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except Exception as e:
        print("JWT decode error:", e)
        raise HTTPException(status_code=403, detail="Invalid token")

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    return decode_token(token)
