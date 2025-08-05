# from jose import JWTError, jwt
# from passlib.context import CryptContext
# from fastapi import HTTPException, Request
# import os
# from supabase import create_client, Client

# # Tạo kết nối Supabase
# SUPABASE_URL = os.getenv("SUPABASE_URL")
# SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # dùng Service Role Key
# supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# SECRET_KEY = os.getenv("SECRET_KEY")
# ALGORITHM = "HS256"
# pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# def verify_password(plain, hashed):
#     return pwd_context.verify(plain, hashed)

# def hash_password(password):
#     return pwd_context.hash(password)

# def create_token(data: dict):
#     return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)

# def decode_token(token: str):
#     return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

# # Dùng trong Depends hoặc bảo vệ route
# def get_current_user(request: Request):
#     auth_header = request.headers.get("Authorization")
#     if not auth_header:
#         raise HTTPException(status_code=401, detail="Token missing")
    
#     try:
#         scheme, token = auth_header.split()
#         if scheme.lower() != "bearer":
#             raise HTTPException(status_code=401, detail="Invalid auth scheme")
        
#         payload = decode_token(token)
#         user_id = payload.get("user_id") or payload.get("sub")
#         if not user_id:
#             raise HTTPException(status_code=401, detail="Invalid token payload")

#         # Truy vấn Supabase
#         result = supabase.table("users").select("*").eq("id", user_id).single().execute()
#         if result.data is None:
#             raise HTTPException(status_code=404, detail="User not found")

#         return result.data  # dict chứa thông tin user

#     except (JWTError, ValueError):
#         raise HTTPException(status_code=401, detail="Invalid token")
