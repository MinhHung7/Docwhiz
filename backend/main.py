from fastapi import FastAPI, Request, Depends, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
from dotenv import load_dotenv
from auth import get_current_user
from fastapi import Header, Body
from pydantic import BaseModel
import uuid
from datetime import datetime
import mimetypes
from pathlib import Path
import asyncio
import unicodedata
import re
import requests
import tempfile
from storage import MultiFileRAGSystem
from fastapi import BackgroundTasks
from custom_note import CustomNote
from custom_mindmap import CustomMindmap
from typing import Optional
from transform_json_to_hierarchy import transform_json_to_hierarchy
import json

load_dotenv()

app = FastAPI()

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase client
supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # sử dụng service role để ghi
)

token_auth_scheme = HTTPBearer()

@app.post("/sync_user")
def sync_user(
    authorization: str = Header(...),
):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization.split(" ")[1]

    # Gọi Supabase để lấy thông tin người dùng từ token
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = user.id
    email = user.email
    name = user.user_metadata.get("name", "")

    # Kiểm tra và thêm vào bảng "users"
    existing = supabase.table("users").select("*").eq("id", user_id).execute()
    if len(existing.data) == 0:
        supabase.table("users").insert({"id": user_id, "email": email, "name": name}).execute()
        print(f"User {user_id} inserted into 'users'")
    else:
        print(f"User {user_id} already exists")

    return {"message": "Synced"}


@app.get("/getChatsHistory")
def get_chats_history(
    authorization: str = Header(...),
):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization.split(" ")[1]
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = user.id

    chat_history = (supabase.table("chat_histories")
                    .select("chat_history_title", "chat_history_id")
                    .eq("user_id", user_id)
                    .order("last_edited_at", desc=True)
                    .execute())

    if not chat_history.data:
        return {"chatsHistory": []}

    # Tạo danh sách đúng cấu trúc
    chatsHistory = [
        {
            "id": item["chat_history_id"],
            "title": item["chat_history_title"]
        }
        for item in chat_history.data
    ]

    return {"chatsHistory": chatsHistory}

class CreateChatRequest(BaseModel):
    title: str

@app.post("/createChatHistory")
def create_chat_history(
    request: CreateChatRequest,
    authorization: str = Header(...)
):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization.split(" ")[1]
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = user.id
    new_chat_id = str(uuid.uuid4())

    supabase.table("chat_histories").insert({
        "chat_history_id": new_chat_id,
        "user_id": user_id,
        "chat_history_title": request.title,
    }).execute()

    return {"message": "New chat history created", "chat_history_id": new_chat_id}

# Input model
class RenameChatTitleRequest(BaseModel):
    chat_history_id: str
    new_title: str

@app.put("/renameChatHistoryTitle")
async def rename_chat_history(
    body: RenameChatTitleRequest, request: Request
):
    # Xác thực token
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = token[7:]
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:
        raise HTTPException(status_code=403, detail="Invalid token")

    user_id = user.id
    # Cập nhật nội dung
    try:
        response = (
            supabase.table("chat_histories")
            .update({
                "chat_history_title": body.new_title,
            })
            .eq("chat_history_id", body.chat_history_id)
            .eq("user_id", user_id)
            .execute()
        )
        return {"message": "Cập nhật thành công"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class CreateChatContentRequest(BaseModel):
    chat_history_id: str
    query: str
    response: str

@app.post("/createChatContent")
async def createChatContent(
    request: Request,  # ✅ Đặt request trước để tránh lỗi syntax
    body: CreateChatContentRequest
):
    # ✅ Xác thực token
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = token[7:]  # Bỏ "Bearer "
    try:
        resp = supabase.auth.get_user(token)
        user = resp.user
    except Exception as e:
        raise HTTPException(status_code=403, detail=f"Invalid token: {str(e)}")

    if not user:
        raise HTTPException(status_code=403, detail="Invalid token")

    try:
        # ✅ Insert bản ghi mới vào bảng chats
        supabase.table("chats").insert({
            "chat_id": str(uuid.uuid4()),
            "chat_history_id": body.chat_history_id,
            "query": body.query,
            "response": body.response,
            "created_at": datetime.utcnow().isoformat(),
        }).execute()

        # ✅ Update bảng chat_histories để cập nhật thời gian chỉnh sửa
        supabase.table("chat_histories").update({
            "last_edited_at": datetime.utcnow().isoformat()
        }).eq("chat_history_id", body.chat_history_id).execute()

        return {"message": "Lưu nội dung chat và cập nhật thành công"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi ghi database: {str(e)}")

@app.get("/getAllChatContent")
async def getAllChatContent(
    chat_history_id: str, request: Request
):
    # Xác thực token
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = token[7:]
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:    
        raise HTTPException(status_code=403, detail="Invalid token")

    try:
        response = (
            supabase.table("chats")
           .select("query", "response")
           .eq("chat_history_id", chat_history_id)
           .order("created_at", desc=False)
           .execute()
        )
        messages = []
        for item in response.data:
            messages.append({"role": "user", "content": item["query"]})
            messages.append({"role": "bot", "content": item["response"]})

        return {"messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))     


@app.get("/getAllFiles")
async def getAllFiles(
    chat_history_id: str, request: Request
):
    # Xác thực token
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = token[7:]
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:
        raise HTTPException(status_code=403, detail="Invalid token")

    try:
        response = (
           supabase.table("files")
          .select("file_name", "file_id")
          .eq("chat_history_id", chat_history_id)
          .execute()    
        )
        return {"files": response.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024  # 10MB
ALLOWED_FILE_TYPES = {
    'application/pdf',
}
def sanitize_filename(filename):
    # Loại bỏ dấu
    name = unicodedata.normalize('NFD', filename).encode('ascii', 'ignore').decode("utf-8")
    # Thay dấu cách bằng gạch ngang và loại ký tự lạ
    name = re.sub(r"[^\w\.-]", "-", name)
    return name

@app.post("/uploadFile")
async def uploadFile(
    request: Request,
    chat_history_id: str = Form(...),
    file: UploadFile = File(...),  
):
    # Xác thực token
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = token[7:]
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:
        raise HTTPException(status_code=403, detail="Invalid token")
    
    user_id = user.id

    try:
        # 1. Validate file before reading
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")
            
        # 2. Check file size before reading content
        file_size = 0
        contents = b""
        while chunk := await file.read(8192):  # Read in chunks to handle large files
            contents += chunk
            file_size += len(chunk)
            if file_size > MAX_FILE_SIZE:
                raise HTTPException(status_code=413, detail="File too large")
        
        print(f"File size: {file_size} bytes")
        
        # 3. Validate file type
        if file.content_type not in ALLOWED_FILE_TYPES:
            # Try to detect MIME type from filename as fallback
            detected_type, _ = mimetypes.guess_type(file.filename)
            if detected_type not in ALLOWED_FILE_TYPES:
                raise HTTPException(
                    status_code=400, 
                    detail=f"File type {file.content_type} not allowed"
                )
            file_type = detected_type
        else:
            file_type = file.content_type
        
        # 4. Sanitize filename
        file_name = sanitize_filename(file.filename)
        file_name = Path(file_name).name  # Remove any path components
        file_name = "".join(c for c in file_name if c.isalnum() or c in "._-").strip()
        if not file_name:
            file_name = f"file_{uuid.uuid4().hex[:8]}"
            
        # 5. Add timestamp to prevent conflicts
        timestamp = int(datetime.utcnow().timestamp())
        file_name = f"{file_name}"
        
        file_id = str(uuid.uuid4())
        path = f"{user_id}/{chat_history_id}/{file_name}"
        
        print(f"Sanitized filename: {file_name}")
        print(f"Upload path: {path}")
        
        # 6. Upload with retry logic
        max_retries = 3
        for attempt in range(max_retries):
            try:
                print(f"Uploading file to storage...")
                storage_resp = supabase.storage.from_("usersfiles").upload(
                    path=path,
                    file=contents,
                    file_options={
                        "content-type": file_type,
                        "cache-control": "3600",
                        "upsert": "false"
                    }
                )
                break  # Success, exit retry loop
            except Exception as storage_error:
                if attempt == max_retries - 1:  # Last attempt
                    if "already exists" in str(storage_error).lower():
                        # Try one final time with upsert=true
                        storage_resp = supabase.storage.from_("usersfiles").upload(
                            path=path,
                            file=contents,
                            file_options={
                                "content-type": file_type,
                                "cache-control": "3600",
                                "upsert": "true"
                            }
                        )
                    else:
                        raise HTTPException(
                            status_code=500, 
                            detail=f"Storage upload failed after {max_retries} attempts: {storage_error}"
                        )
                else:
                    print(f"Upload attempt {attempt + 1} failed, retrying...")
                    await asyncio.sleep(1)  # Wait 1 second before retry
        
        # 7. Verify upload by checking if file exists
        try:
            print(f"Verifying file upload...")
            list_resp = supabase.storage.from_("usersfiles").list(f"{user_id}/{chat_history_id}")
            uploaded_files = [f['name'] for f in list_resp]
            if file_name not in uploaded_files:
                raise HTTPException(status_code=500, detail="File upload verification failed")
        except Exception as verify_error:
            print(f"Upload verification warning: {verify_error}")
            # Don't fail completely if verification fails, just log warning
        
        # 8. Generate signed URL instead of public URL for better security (optional)
        try:
            print(f"Generating signed URL...")
            signed_url_resp = supabase.storage.from_("usersfiles").create_signed_url(
                path, 3600  # URL valid for 1 hour
            )
            if hasattr(signed_url_resp, 'get') and signed_url_resp.get('signedURL'):
                print(f"Signed URL generated successfully")
                file_url = signed_url_resp['signedURL']
            else:
                # Fallback to public URL
                print(f"Failed to generate signed URL, using public URL instead 1")
                file_url = f"{os.getenv('SUPABASE_URL')}/storage/v1/object/public/usersfiles/{path}"
        except:
            print(f"Failed to generate signed URL, using public URL instead 2")
            # Fallback to public URL if signed URL creation fails
            file_url = f"{os.getenv('SUPABASE_URL')}/storage/v1/object/public/usersfiles/{path}"
        
        # ... rest of database insertion code ...
        try:
            print(f"Inserting file metadata to DB...")
            insert_resp = supabase.table("files").insert({
                "file_id": file_id,
                "chat_history_id": chat_history_id,
                "file_name": file.filename,
                "file_url": file_url,
                "file_size": file_size,
                "file_type": file_type,
                "uploaded_at": datetime.utcnow().isoformat()
            }).execute()
        except Exception as db_error:
            print(f"Insert file metadata failed: {db_error}")
            raise HTTPException(status_code=500, detail=f"Insert to DB failed: {str(db_error)}")

        try:
            print(f"Loading chunks...")
            ragsystem = MultiFileRAGSystem(user_id=user_id, chat_history_id=chat_history_id)
            print(f"Storing documents...")
            print(f"File ID: {file_id}")
            print(f"File name: {file_name}")
            print(f"File type: {file_type}")
            ragsystem.store_documents(contents=contents, file_id=file_id, filename=file_name, file_type=file_type)
            print(f"Documents stored successfully")

        except Exception as e:
            print(f"Error loading chunks: {e}")
            raise HTTPException(status_code=500, detail=f"Error loading chunks: {str(e)}")

        return {
            "success": True,
            "file_id": file_id,
            "file_url": file_url,
            "file_name": file.filename,
            "file_size": file_size,
            "file_type": file_type,
            "uploaded_at": datetime.utcnow().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in uploadFile: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
    finally:
        # Cleanup
        try:
            await file.seek(0)
        except:
            pass

class DeleteChatRequest(BaseModel):
    chat_history_id: str
@app.delete("/deleteChatHistory")
async def delete_chat_history(
    data: DeleteChatRequest,
    request: Request,
):
    # Xác thực token
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = token[7:]
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:    
        raise HTTPException(status_code=403, detail="Invalid token")

    user_id = user.id
    # Truy vấn để kiểm tra xem chat có thuộc về user không
    existing = (
        supabase
        .from_("chat_histories")
        .select("chat_history_id")
        .eq("chat_history_id", data.chat_history_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if existing.data is None:
        raise HTTPException(status_code=404, detail="Chat not found or not authorized")

    # Xoá
    response = (
        supabase
        .from_("chat_histories")
        .delete()
        .eq("chat_history_id", data.chat_history_id)
        .eq("user_id", user_id)
        .execute()
    )

    return {"message": "Chat deleted successfully"}

@app.get("/getResponseFromQuery")
async def getResponseFromQuery(
    query: str,
    chat_history_id: str,
    request: Request,
):
    # Xác thực token
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = token[7:]  
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:
        raise HTTPException(status_code=403, detail="Invalid token")
    
    user_id = user.id

    try:
        ragsystem = MultiFileRAGSystem(user_id=user_id, chat_history_id=chat_history_id)
        response = ragsystem.chat(query)
        
        return {"response": response}
    except Exception as e:
        print(f"Error in getResponseFromQuery: {e}")
    

class RenameFileRequest(BaseModel):
    chat_history_id: str
    file_id: str
    old_name: str
    new_name: str
@app.post("/renameFile")
async def renameFile(
    request: Request,
    data: RenameFileRequest,
):
    # Xác thực token
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = token[7:]
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:
        raise HTTPException(status_code=403, detail="Invalid token")

    user_id = user.id

    bucket_path = f"{user_id}/{data.chat_history_id}/{data.old_name}"
    new_path = f"{user_id}/{data.chat_history_id}/{data.new_name}"

    # Step 3: Update Postgres DB
    update_res = supabase.table("files").update({"file_name": data.new_name}).eq("file_id", data.file_id).execute()
    if update_res.data is None:
        raise HTTPException(status_code=500, detail="Database update failed")

    # # Step 4: Rename file in Supabase Storage (copy then delete)
    copy_res = supabase.storage.from_("usersfiles").move(bucket_path, new_path)
    # if copy_res.get("error"):
    #     raise HTTPException(status_code=500, detail=f"Storage copy failed: {copy_res['error']['message']}")

    # remove_res = supabase.storage.from_("usersfiles").remove([bucket_path])

    return {
        "message": "Rename successful",
        "old_name": data.old_name,
        "new_name": data.new_name,
    }

class DeleteFileRequest(BaseModel):
    chat_history_id: str
    file_id: str
    file_name: str
@app.delete("/deleteFile")
async def deleteFile(
    request: Request,
    data: DeleteFileRequest,
):
    # Xác thực token
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = token[7:]
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:   
        raise HTTPException(status_code=403, detail="Invalid token")

    user_id = user.id

    # Xóa file trong bảng files
    delete_res = supabase.table("files").delete().eq("file_id", data.file_id).execute()
    if delete_res.data is None:
        raise HTTPException(status_code=500, detail="Database delete failed")

    # Xóa file trong Supabase Storage
    bucket_path = f"{user_id}/{data.chat_history_id}/{data.file_name}"
    remove_res = supabase.storage.from_("usersfiles").remove([bucket_path])

    return {
        "message": "File deleted successfully",
    }

@app.get("/getAllMindmapNotes")
async def getAllMindmapNotes(
    chat_history_id: str,
    request: Request,
):
    # Xác thực token
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = token[7:]
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:
        raise HTTPException(status_code=403, detail="Invalid token")

    user_id = user.id

    # Lấy danh sách tất cả các chat_history_id của người dùng
    mindmap_notes = supabase.table("mindmapnotes").select("mindmap_note_name", "mindmap_note_id", "type", "mindmap_content", "note_content").eq("chat_history_id", chat_history_id).execute()
    return {"mindmap_notes": mindmap_notes.data}

class DeleteMindmapNoteRequest(BaseModel):
    chat_history_id: str
    mindmap_note_id: str
@app.delete("/deleteMindmapNote")
async def deleteMindmapNote(
    request: Request,
    data: DeleteMindmapNoteRequest,
):
    # Xác thực token
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = token[7:]
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:   
        raise HTTPException(status_code=403, detail="Invalid token")

    user_id = user.id

    # Xóa file trong bảng mindmapnotes
    delete_res = supabase.table("mindmapnotes").delete().eq("mindmap_note_id", data.mindmap_note_id).execute()
    if delete_res.data is None:
        raise HTTPException(status_code=500, detail="Database delete failed")

    return {
        "message": "Mindmap Note deleted successfully",
    }


def update_mindmap_note_name_task(chat_history_id: str, mindmap_note_id: str, new_name: str):
    try:
        update_res = (supabase.table("mindmapnotes").update({"mindmap_note_name": new_name}).eq("mindmap_note_id", mindmap_note_id).eq("chat_history_id", chat_history_id).execute())

        if update_res.data is None:
            print("❌ Update failed")
        else:
            print("✅ Mindmap note name updated in background.")
    except Exception as e:
        print("❌ Exception in background task:", e)

class RenameMindmapNoteRequest(BaseModel):
    chat_history_id: str
    mindmap_note_id: str
    new_name: str
@app.post("/renameMindmapNote")
async def renameMindmapNote(
    request: Request,
    data: RenameMindmapNoteRequest,
    background_tasks: BackgroundTasks,
):
    # Xác thực token
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = token[7:]
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:
        raise HTTPException(status_code=403, detail="Invalid token")

    user_id = user.id

    background_tasks.add_task(update_mindmap_note_name_task, data.chat_history_id, data.mindmap_note_id, data.new_name)

    return {
        "message": "Rename successful",
        "new_name": data.new_name,
    }

@app.get("/getFileSummary")
async def getFileSummary(
    chat_history_id: str,
    file_id: str,
    request: Request,
):
    # Xác thực token
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = token[7:]
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:    
        raise HTTPException(status_code=403, detail="Invalid token")

    user_id = user.id

    # Lấy thông tin file từ bảng files
    file_summary = supabase.table("files").select("file_summary").eq("file_id", file_id).eq("chat_history_id", chat_history_id).single().execute()
    if file_summary.data is None:
        raise HTTPException(status_code=404, detail="File summary not found")

    return {"file_summary": file_summary.data["file_summary"]}


def update_summary_task(chat_history_id: str, file_id: str, new_summary: str):
    try:
        update_res = (
            supabase
            .table("files")
            .update({"file_summary": new_summary})
            .eq("file_id", file_id)
            .eq("chat_history_id", chat_history_id)
            .execute()
        )
        if update_res.data is None:
            print("❌ Update failed")
        else:
            print("✅ File summary updated in background.")
    except Exception as e:
        print("❌ Exception in background task:", e)

class FileSummaryUpdateRequest(BaseModel):
    chat_history_id: str
    file_id: str
    new_summary: str
@app.put("/updateFileSummary")
async def updateFileSummary(
    data: FileSummaryUpdateRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    # Xác thực token
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = token[7:]
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:
        raise HTTPException(status_code=403, detail="Invalid token")

    user_id = user.id

    background_tasks.add_task(update_summary_task, data.chat_history_id, data.file_id, data.new_summary)

    return {
        "message": "File summary updated successfully",
    }

# @app.get("/getNoteContent")
# async def getNoteContent(
#     chat_history_id: str,
#     mindmap_note_id: str,
#     request: Request,
# ):
#     # Xác thực token
#     token = request.headers.get("Authorization")
#     if not token or not token.startswith("Bearer "):
#         raise HTTPException(status_code=401, detail="Missing or invalid token")

#     token = token[7:]
#     resp = supabase.auth.get_user(token)
#     user = resp.user

#     if not user:    
#         raise HTTPException(status_code=403, detail="Invalid token")

#     user_id = user.id

#     # Lấy thông tin file từ bảng files
#     note_content = supabase.table("mindmapnotes").select("note_content").eq("mindmap_note_id", mindmap_note_id).eq("chat_history_id", chat_history_id).single().execute()
#     if note_content.data is None:
#         raise HTTPException(status_code=404, detail="Note content not found")

#     return {"note_content": note_content.data["note_content"]}

class CustomNoteCreateRequest(BaseModel):
    chat_history_id: str
    file_id: str
    note_title: Optional[str] = "Custom Note"
    note_target: str
    note_language: str
    note_detailed_level: str
@app.post("/createCustomNote")
async def createCustomNote(
    data: CustomNoteCreateRequest,
    request: Request,
):
    # Xác thực token
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = token[7:]
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:    
        raise HTTPException(status_code=403, detail="Invalid token")

    user_id = user.id

    # Lấy thông tin file từ bảng files
    file_content = supabase.table("files").select("file_content").eq("file_id", data.file_id).eq("chat_history_id", data.chat_history_id).single().execute()

    if file_content.data is None:
        raise HTTPException(status_code=404, detail="File content not found")

    note_content = file_content.data["file_content"]

    note_generator = CustomNote()

    custom_note_content = note_generator.createCustomNote(
        content=note_content,
        note_target=data.note_target,
        note_language=data.note_language,
        note_detailed_level=data.note_detailed_level,
        stream=True
    )

    # Save the custom note content to the supabase
    mindmap_note_id = str(uuid.uuid4())

    insert_res = supabase.table("mindmapnotes").insert({
        "mindmap_note_id": mindmap_note_id,
        "chat_history_id": data.chat_history_id,
        "mindmap_note_name": data.note_title,
        "note_content": custom_note_content,
        "type": "note",
        "created_at": datetime.utcnow().isoformat(),
    }).execute()

    if insert_res.data is None:
        raise HTTPException(status_code=500, detail="Database insert failed")
    
    return {
        "message": "Custom note created successfully",
    }

class CustomMindmapCreateRequest(BaseModel):
    chat_history_id: str
    file_id: str
    mindmap_title: Optional[str] = "Custom Mindmap"
    mindmap_target: str
    mindmap_language: str
    mindmap_detailed_level: str
@app.post("/createCustomMindmap")
async def createCustomMindmap(
    data: CustomMindmapCreateRequest,
    request: Request,
):
    # Xác thực token
    token = request.headers.get("Authorization")
    if not token or not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = token[7:]
    resp = supabase.auth.get_user(token)
    user = resp.user

    if not user:    
        raise HTTPException(status_code=403, detail="Invalid token")

    user_id = user.id

    # Lấy thông tin file từ bảng files
    file_content = supabase.table("files").select("file_content").eq("file_id", data.file_id).eq("chat_history_id", data.chat_history_id).single().execute()

    if file_content.data is None:
        raise HTTPException(status_code=404, detail="File content not found")

    mindmap_content = file_content.data["file_content"]

    mindmap_generator = CustomMindmap()

    custom_mindmap_content = mindmap_generator.createCustomMindmap(
        content=mindmap_content,
        mindmap_target=data.mindmap_target,
        mindmap_language=data.mindmap_language,
        mindmap_detailed_level=data.mindmap_detailed_level,
        stream=True
    )

    json_text = custom_mindmap_content[custom_mindmap_content.find('{'):custom_mindmap_content.rfind('}') + 1]
                
    mindmap = json.loads(json_text)

    mindmap = transform_json_to_hierarchy(mindmap)

    # Save the custom note content to the supabase
    mindmap_note_id = str(uuid.uuid4())

    insert_res = supabase.table("mindmapnotes").insert({
        "mindmap_note_id": mindmap_note_id,
        "chat_history_id": data.chat_history_id,
        "mindmap_note_name": data.mindmap_title,
        "mindmap_content": mindmap,
        "type": "mindmap",
        "created_at": datetime.utcnow().isoformat(),
    }).execute()

    if insert_res.data is None:
        raise HTTPException(status_code=500, detail="Database insert failed")
    
    return {
        "message": "Custom mindmap created successfully",
    }



    