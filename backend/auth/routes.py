# from fastapi import APIRouter, Request, Depends, HTTPException
# from fastapi.responses import RedirectResponse
# from auth.google_oauth import oauth
# from supabase import create_client
# import os
# from starlette.responses import Response

# router = APIRouter()

# SUPABASE_URL = os.getenv("SUPABASE_URL")
# SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # nên dùng Service Role key ở backend
# FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# @router.get("/login/google")
# async def login_with_google(request: Request):
#     try:
#         redirect_uri = request.url_for('google_callback')
#         print("✅ Redirect URI:", redirect_uri)
#         return await oauth.google.authorize_redirect(request, redirect_uri)
#     except Exception as e:
#         print("❌ Error in login_with_google:", e)
#         raise HTTPException(status_code=500, detail=str(e))

# @router.get("/auth/google/callback")
# async def google_callback(request: Request):
#     token = await oauth.google.authorize_access_token(request)
#     print("Token:", token)

#     user_info = await oauth.google.userinfo(token=token)
#     print("User Info:", user_info)


#     email = user_info["email"]
#     name = user_info.get("name", "")

#     # Tìm hoặc tạo user trong bảng "users" (hoặc tên bảng bạn dùng)
#     result = supabase.table("users").select("*").eq("email", email).execute()
#     if not result.data:
#         supabase.table("users").insert({
#             "email": email,
#             "name": name,
#             # Các field khác tùy bạn định nghĩa trong schema
#         }).execute()


#     # Giả sử frontend bạn dùng Supabase Auth, hãy chuyển control về frontend
#     response = RedirectResponse(url=FRONTEND_URL)
#     return response
