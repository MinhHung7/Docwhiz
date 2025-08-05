import os
import time
import json
import requests
from typing import List, Dict, Any, Optional
from loader import ParallelLoader
from langchain_community.vectorstores import Chroma
from langchain_core.embeddings import Embeddings
from langchain_core.documents import Document
import google.generativeai as genai
import threading
from uuid import uuid4
from datetime import datetime
from supabase import create_client, Client
from summary import Summarizer
from fastapi import BackgroundTasks
from transform_json_to_hierarchy import transform_json_to_hierarchy

# Configure Gemini API for generation only
genai.configure(api_key=os.environ["GEMINI_API_KEY"])

def update_file_content_to_files(chat_history_id: str, file_id: str, file_content: str):
    """Hàm chạy trong luồng riêng để update content"""
    try:
        # Supabase client
        supabase: Client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # sử dụng service role để ghi
        )

        # update summary content to table files
        data = {
            "file_content": file_content,
        }

        response = supabase.table("files").update(data).eq("chat_history_id", chat_history_id).eq("file_id", file_id).execute()
        print("✅ Content saved to Supabase")
    except Exception as e:
        print(f"❌ Error in update thread: {e}")

class JinaEmbeddings(Embeddings):
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("JINA_API_KEY")
        if not self.api_key:
            raise ValueError("JINA_API_KEY environment variable must be set")
        
        self.model = "jina-embeddings-v3"
        self.base_url = "https://api.jina.ai/v1/embeddings"
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
    
    def _make_request(self, texts: List[str], task: str = "retrieval.passage") -> List[List[float]]:
        """Make request to Jina AI API"""
        payload = {
            "model": self.model,
            "task": task,
            "dimensions": 1024,  # Jina v3 supports up to 8192, but 1024 is efficient
            "input": texts
        }
        
        try:
            response = requests.post(
                self.base_url,
                headers=self.headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            
            data = response.json()
            return [item["embedding"] for item in data["data"]]
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Error making request to Jina AI: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"Response: {e.response.text}")
            raise e
    
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Embed multiple documents"""
        embeddings = []
        batch_size = 10  # Process in batches to avoid rate limits
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            try:
                batch_embeddings = self._make_request(batch, task="retrieval.passage")
                embeddings.extend(batch_embeddings)
                
                # Rate limiting
                if i + batch_size < len(texts):
                    time.sleep(0.5)
                    
            except Exception as e:
                print(f"❌ Error embedding batch {i//batch_size + 1}: {e}")
                # Add zero vectors for failed embeddings
                for _ in batch:
                    embeddings.append([0.0] * 1024)
        
        return embeddings

    def embed_query(self, text: str) -> List[float]:
        """Embed a single query"""
        try:
            result = self._make_request([text], task="retrieval.query")
            return result[0]
        except Exception as e:
            print(f"❌ Error embedding query: {e}")
            return [0.0] * 1024

class FileManager:
    """Quản lý thông tin file và mapping"""
    
    def __init__(self, user_id: str, chat_history_id: str):
        self.user_id = user_id
        self.chat_history_id = chat_history_id
        self.metadata_file = f"./chroma_store/{user_id}/chat_{chat_history_id}_files.json"
        self.files_info = self.load_files_info()
    
    def load_files_info(self) -> Dict:
        """Load file metadata"""
        if os.path.exists(self.metadata_file):
            try:
                with open(self.metadata_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"❌ Error loading files info: {e}")
        return {}
    
    def save_files_info(self):
        """Save file metadata"""
        os.makedirs(os.path.dirname(self.metadata_file), exist_ok=True)
        with open(self.metadata_file, 'w', encoding='utf-8') as f:
            json.dump(self.files_info, f, ensure_ascii=False, indent=2)
    
    def add_file(self, file_id: str, filename: str, file_type: str = None):
        """Add file information"""
        self.files_info[file_id] = {
            'filename': filename,
            'file_type': file_type,
            'added_at': time.time(),
            'chunk_count': 0
        }
        self.save_files_info()
    
    def remove_file(self, file_id: str):
        """Remove file information"""
        if file_id in self.files_info:
            del self.files_info[file_id]
            self.save_files_info()
    
    def get_all_files(self) -> List[str]:
        """Get all file IDs"""
        return list(self.files_info.keys())
    
    def get_file_info(self, file_id: str) -> Dict:
        """Get specific file info"""
        return self.files_info.get(file_id, {})

class MultiFileRAGSystem:
    def __init__(self, user_id: str, chat_history_id: str, jina_api_key: Optional[str] = None):
        self.user_id = user_id
        self.chat_history_id = chat_history_id
        
        self.embedding_model = JinaEmbeddings(api_key=jina_api_key)
        self.persist_dir = f"./chroma_store/{user_id}"
        # Sử dụng 1 collection cho tất cả files của user trong chat này
        self.collection_name = f"{user_id}_{chat_history_id}"
        self.chroma = None
        
        # File manager
        self.file_manager = FileManager(user_id, chat_history_id)
        
        # Generation model
        self.generation_model = genai.GenerativeModel('gemini-2.5-pro')
    
    def save_summary_to_mindmapnote(self, chat_history_id: str, file_id: str, file_summary: str):
        try:
            mindmapnote_id = str(uuid4())
            created_at = datetime.utcnow().isoformat()

            # Take filename from supabase
            supabase: Client = create_client(
                os.getenv("SUPABASE_URL"),
                os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # sử dụng service role để ghi
            )
            file_name = supabase.table("files").select("file_name").eq("file_id", file_id).eq("chat_history_id", chat_history_id).execute()

            if file_name.data is None or not file_name.data:
                print("❌ File name not found")
                return

            file_name = file_name.data[0]["file_name"]
            if '.pdf' in file_name:
                file_name = file_name.replace('.pdf', '')
                
            update_res = (
                supabase
                .table("mindmapnotes")
                .insert({"mindmap_note_id": mindmapnote_id, "chat_history_id": chat_history_id, "note_content": file_summary, "mindmap_note_name": file_name, "note_content": file_summary, "created_at": created_at, "type": "note"})
                .execute()
            )
            if update_res.data is None:
                print("❌ Update failed")
            else:
                print("✅ File summary updated in mindmapnotes.")
        except Exception as e:
            print("❌ Exception in background task:", e)

    
    def save_summary_to_files(self, chat_history_id: str, file_id: str, summary: str):
        try:
            # Supabase client
            supabase: Client = create_client(
                os.getenv("SUPABASE_URL"),
                os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # sử dụng service role để ghi
            )

            # update summary content to table files
            data = {
                "file_summary": summary,
            }

            response = supabase.table("files").update(data).eq("chat_history_id", chat_history_id).eq("file_id", file_id).execute()
            print("✅ Summary saved to Supabase")
        except Exception as e:
            print(f"❌ Error saving summary to Supabase: {e}")
    def save_mindmap_to_supabase(self, chat_history_id: str, mindmap_name: str, mindmap_content: dict):
        try:
            # Supabase client
            supabase: Client = create_client(
                os.getenv("SUPABASE_URL"),
                os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # sử dụng service role để ghi
            )

            mindmap_id = str(uuid4())
            created_at = datetime.utcnow().isoformat()

            data = {
                "mindmap_note_id": mindmap_id,
                "chat_history_id": chat_history_id,
                "type": "mindmap",
                "mindmap_note_name": mindmap_name,
                "mindmap_content": mindmap_content,
                "created_at": created_at
            }

            response = supabase.table("mindmapnotes").insert(data).execute()
            print("✅ Mindmap saved to Supabase")
            return response
        except Exception as e:
            print(f"❌ Error saving mindmap to Supabase: {e}")
            return None

    def generate_summary_from_chunks(self, chat_history_id: str, file_id: str):
        """Generate summary from chunks associated with a file (background task)"""
        if self.chroma is None:
            self.load_existing_store()
        if self.chroma is None:
            print("❌ No vector store found for summary generation.")
            return

        try:
            # Lấy các chunks liên quan đến file_id
            results = self.chroma.get(where={"file_id": file_id})
            if not results["documents"]:
                print(f"⚠️ No chunks found for file_id {file_id}")
                return

            # Nối nội dung
            content = "\n".join(results["documents"]) 

            # Tạo luồng riêng để thực hiện update content lên bảng files của supabase
            update_content_thread = threading.Thread(
                target=update_file_content_to_files,
                args=(chat_history_id, file_id, content),
                daemon=True
            )
            update_content_thread.start()

            try:
                summarizer = Summarizer()
                summary = summarizer.summarize(content)

                self.save_summary_to_files(chat_history_id, file_id, summary)
                self.save_summary_to_mindmapnote(chat_history_id, file_id, summary)

            except Exception as e:
                print(f"❌ Error generating summary: {e}")

        except Exception as e:
            print(f"❌ Error in background summary generation: {e}")


    def generate_mindmap_from_chunks(self, chat_history_id: str, file_id: str):
        """Generate mindmap from chunks associated with a file (background task)"""
        if self.chroma is None:
            self.load_existing_store()
        if self.chroma is None:
            print("❌ No vector store found for mindmap generation.")
            return

        try:
            # Lấy các chunks liên quan đến file_id
            results = self.chroma.get(where={"file_id": file_id})
            if not results["documents"]:
                print(f"⚠️ No chunks found for file_id {file_id}")
                return
            
            # Nối các page_content lại thành content
            content = "\n".join(results["documents"])

            # Tạo prompt (dùng Gemini hoặc bất kỳ model nào)
            prompt = f"""
Nhiệm vụ của bạn là **phân tích nội dung văn bản** (Tiếng Việt, Tiếng Anh hoặc Tiếng Nhật) và **chuyển nó thành Mindmap JSON có thể mở rộng**, trong đó mỗi nhánh là một cấp độ nội dung và các nhánh lá chứa **nội dung mô tả cụ thể** thay vì chỉ tên.

Yêu cầu định dạng:
- Trả về một đối tượng JSON **lồng nhau nhiều cấp** (nested JSON).
- Mỗi key là tiêu đề/nội dung của một nhánh trong mindmap.
- Nếu một nhánh có con, nó chứa một object con bên trong.
- Nếu là nhánh **lá** (không có con), nó phải chứa **một chuỗi mô tả nội dung** thay vì object.

Ví dụ mong muốn:
json
{{
  "Artificial Intelligence": {{
    "Machine Learning": {{
      "Supervised Learning": {{
        "Classification": "Use labeled data to predict categories",
        "Regression": "Giải thích về RMSprop, Adam, và tối ưu hóa mạng neural..."
      }},
      "Unsupervised Learning": {{
        "Clustering": "Group data points based on similarity",
        "Dimensionality Reduction": "Reduce feature space while preserving information"
      }}
    }}
  }}
}}

Dưới đây là nội dung:

\"\"\"{content}\"\"\"

Chỉ trả về JSON hợp lệ, không cần giải thích thêm.
"""
            # Gọi model sinh JSON
            try:
                response = self.generation_model.generate_content(prompt)
                json_text = response.text[response.text.find('{'):response.text.rfind('}') + 1]
                
                mindmap = json.loads(json_text)

                # Lấy key đầu tiên trong mindmap làm tên nếu có
                first_key = next(iter(mindmap.keys()), None)

                mindmap = transform_json_to_hierarchy(mindmap)

                # Nếu tồn tại key đầu tiên thì dùng làm tên
                if first_key:
                    mindmap_name = first_key
                else:
                    # Fallback nếu không có key đầu tiên
                    mindmap_name = self.file_manager.get_file_info(file_id).get("filename", f"mindmap_{file_id}")

                self.save_mindmap_to_supabase(chat_history_id, mindmap_name, mindmap)
                
                print(f"✅ Mindmap JSON generated and saved: {mindmap_name}")
            except Exception as e:
                print(f"❌ Error generating mindmap: {e}")
        except Exception as e:
            print(f"❌ Error in background mindmap generation: {e}")

    def store_documents(self, contents, file_id: str, filename: str, file_type: str = None):
        """Store documents from a specific file"""
        loader = ParallelLoader(file_content=contents, max_workers=4)
        print(f"📂 Loading {filename}...")
        doc_chunks = loader.load_chunks()
        print(f"📂 {len(doc_chunks)} chunks loaded")
        
        # Add file_id to metadata of each chunk
        for doc in doc_chunks:
            doc.metadata.update({
                'file_id': file_id,
                'filename': filename,
                'file_type': file_type
            })
        
        print(f"📊 Processing {len(doc_chunks)} chunks from {filename}...")
        
        try:
            # Load existing store or create new one
            if self.chroma is None:
                print("📂 Loading existing vector store...")
                self.load_existing_store()
            
            if self.chroma is None:
                # Create new store
                print("📂 Creating new vector store...")
                self.chroma = Chroma.from_documents(
                    documents=doc_chunks,
                    embedding=self.embedding_model,
                    persist_directory=self.persist_dir,
                    collection_name=self.collection_name,
                )
                print("✅ New vector store created")
            else:
                # Add to existing store
                print("📂 Adding to existing vector store...")
                self.chroma.add_documents(doc_chunks)
            
            self.chroma.persist()
            
            # Update file manager
            self.file_manager.add_file(file_id, filename, file_type)
            self.file_manager.files_info[file_id]['chunk_count'] = len(doc_chunks)
            self.file_manager.save_files_info()
            
            # Save loaded chunks to file for reference
            chunk_output_dir = os.path.join(self.persist_dir, "chunk_logs")
            os.makedirs(chunk_output_dir, exist_ok=True)
            out_path = os.path.join(chunk_output_dir, f"{file_id}_{filename.replace(' ', '_')}.txt")


            # Thread tạo summary
            threading.Thread(
                target=self.generate_summary_from_chunks,
                args=(self.chat_history_id, file_id,),
                daemon=True
            ).start()

            return True
            
        except Exception as e:
            print(f"❌ Error storing documents: {e}")
            return False

    def remove_file_documents(self, file_id: str):
        """Remove all documents from a specific file"""
        if self.chroma is None:
            self.load_existing_store()
        
        if self.chroma is None:
            print("❌ No vector store found")
            return False
        
        try:
            # Get all documents with this file_id
            results = self.chroma.get(where={"file_id": file_id})
            
            if results['ids']:
                # Delete documents by IDs
                self.chroma.delete(ids=results['ids'])
                self.chroma.persist()
                
                # Remove from file manager
                filename = self.file_manager.get_file_info(file_id).get('filename', 'Unknown')
                self.file_manager.remove_file(file_id)
                
                print(f"✅ Removed {len(results['ids'])} chunks from {filename}")
                return True
            else:
                print(f"⚠️ No documents found for file_id: {file_id}")
                return False
                
        except Exception as e:
            print(f"❌ Error removing documents: {e}")
            return False

    def load_existing_store(self):
        """Load existing vector store"""
        if os.path.exists(self.persist_dir):
            try:
                self.chroma = Chroma(
                    persist_directory=self.persist_dir,
                    collection_name=self.collection_name,
                    embedding_function=self.embedding_model,
                )
                print("✅ Existing vector store loaded")
                return self.chroma
            except Exception as e:
                print(f"❌ Error loading vector store: {e}")
                return None
        return None

    def retrieve_documents(self, query: str, k: int = 5, file_ids: List[str] = None):
        """Retrieve relevant documents, optionally filtered by file_ids"""
        if self.chroma is None:
            self.load_existing_store()
        
        if self.chroma is None:
            return []
        
        try:
            # Create filter if file_ids provided
            where_clause = None
            if file_ids:
                where_clause = {"file_id": {"$in": file_ids}}
            
            docs = self.chroma.similarity_search(
                query, 
                k=k,
                filter=where_clause
            )
            return docs
            
        except Exception as e:
            print(f"❌ Error during retrieval: {e}")
            return []

    def search_across_all_files(self, query: str, k: int = 5):
        """Search across all files in the chat"""
        return self.retrieve_documents(query, k=k)

    def search_specific_files(self, query: str, file_ids: List[str], k: int = 3):
        """Search only in specific files"""
        return self.retrieve_documents(query, k=k, file_ids=file_ids)

    def generate_response_with_retry(self, prompt: str, max_retries: int = 3) -> str:
        """Generate response with retry logic"""
        for attempt in range(max_retries):
            try:
                response = self.generation_model.generate_content(prompt)
                return response.text
            except Exception as e:
                if "429" in str(e) or "quota" in str(e).lower():
                    wait_time = min(60 * (2 ** attempt), 300)
                    print(f"⏳ Rate limit hit. Waiting {wait_time}s before retry {attempt + 1}/{max_retries}...")
                    time.sleep(wait_time)
                else:
                    print(f"❌ Error: {e}")
                    break
        
        return f"❌ Failed to generate response after {max_retries} attempts."

    def chat(self, query: str, k: int = 5, file_ids: List[str] = None):
        """Main chat interface"""
        # Retrieve relevant documents
        context_docs = self.retrieve_documents(query, k=k, file_ids=file_ids)
        if not context_docs:
            answer = "⚠️ No relevant documents found in the uploaded files."
            return {
                "answer": answer,
                "sources": [],
                "query": query,
                "searched_files": file_ids or "all"
            }
        
        # Group sources by file
        sources_by_file = {}
        context_text = []
        for doc in context_docs:
            file_id = doc.metadata.get('file_id', 'unknown')
            filename = doc.metadata.get('filename', 'Unknown File')
            
            if file_id not in sources_by_file:
                sources_by_file[file_id] = {
                    'filename': filename,
                    'chunks': []
                }
            
            sources_by_file[file_id]['chunks'].append({
                'content': doc.page_content,
                'metadata': doc.metadata
            })
            
            context_text.append(f"[From {filename}]: {doc.page_content}")
        
        # Create prompt
        context = "\n\n".join(context_text[:3000])  # Limit context length
        prompt = f"""
You are a helpful assistant. Use the provided context from uploaded documents to answer the user's question as accurately and concisely as possible.

🔹 If the question is written in **Vietnamese**, then respond entirely in **Vietnamese**.
🔹 If the question is in **English**, then respond entirely in **English**.
🔹 If the question is in **Japanese**, then respond entirely in **Japanese**.
🔹 Use clear language. If the answer involves technical details, preserve clarity.
🔹 Do not invent information that is not in the context.

---

📄 Context:
{context}

❓ Question:
{query}

📝 Answer:"""

        answer = self.generate_response_with_retry(prompt)
        response = {
            "answer": answer,
            "sources_by_file": sources_by_file,
            "query": query,
            "searched_files": file_ids or "all"
        }
        
        # Display results
        for file_id, file_info in sources_by_file.items():
            print(f"\n--- {file_info['filename']} ---")
            print(f"   {len(file_info['chunks'])} relevant chunks found")

        # Save relevant chunks to a file
        with open("relevant_chunks.txt", "w", encoding="utf-8") as f:
            f.write(f"Query: {query}\n\n")
            for file_id, file_info in sources_by_file.items():
                f.write(f"=== File: {file_info['filename']} ===\n")
                for i, chunk in enumerate(file_info['chunks']):
                    f.write(f"\n--- Chunk {i + 1} ---\n")
                    f.write(chunk['content'])
                    f.write("\n")
                f.write("\n\n")

        return response

    def list_files(self):
        """List all files in the current chat"""
        files = self.file_manager.get_all_files()
        return files

    def get_file_stats(self):
        """Get statistics about stored files"""
        if self.chroma is None:
            self.load_existing_store()
        
        if self.chroma is None:
            return {"total_files": 0, "total_chunks": 0}
        
        try:
            # Get all documents
            all_docs = self.chroma.get()
            
            # Count by file
            file_counts = {}
            for metadata in all_docs['metadatas']:
                file_id = metadata.get('file_id', 'unknown')
                filename = metadata.get('filename', 'Unknown')
                
                if file_id not in file_counts:
                    file_counts[file_id] = {'filename': filename, 'count': 0}
                file_counts[file_id]['count'] += 1
            
            return {
                "total_files": len(file_counts),
                "total_chunks": len(all_docs['ids']),
                "file_breakdown": file_counts
            }
            
        except Exception as e:
            print(f"❌ Error getting stats: {e}")
            return {"total_files": 0, "total_chunks": 0}
