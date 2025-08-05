import os
import time
import json
import requests
from typing import List, Dict, Any, Optional
from loader import ParallelLoader
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
import weaviate
from weaviate.classes.query import MetadataQuery

# Configure Gemini API for generation only
genai.configure(api_key=os.environ["GEMINI_API_KEY"])
weaviate_url = os.environ["WEAVIATE_URL"]
weaviate_api_key = os.environ["WEAVIATE_API_KEY"]

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
            "dimensions": 1024,  # Jina v3 supports up to 8192, but 1536 is efficient
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
                    embeddings.append([0.0] * 1536)
        
        return embeddings

    def embed_query(self, text: str) -> List[float]:
        """Embed a single query"""
        try:
            result = self._make_request([text], task="retrieval.query")
            return result[0]
        except Exception as e:
            print(f"❌ Error embedding query: {e}")
            return [0.0] * 1536

class FileManager:
    """Quản lý thông tin file và mapping"""
    
    def __init__(self, user_id: str, chat_history_id: str):
        self.user_id = user_id
        self.chat_history_id = chat_history_id
        self.metadata_file = f"./weaviate_store/{user_id}/chat_{chat_history_id}_files.json"
        self.files_info = self.load_files_info()
            
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
        
        # Weaviate setup
        self.collection_name = f"Documents_{user_id}_{chat_history_id}".replace("-", "_")
        self.weaviate_client = None
        self.collection = None
        
        # File manager
        self.file_manager = FileManager(user_id, chat_history_id)
        
        # Generation model
        self.generation_model = genai.GenerativeModel('gemini-2.5-pro')
        
        # Initialize Weaviate connection
        self.initialize_weaviate()
    
    def initialize_weaviate(self):
        """Initialize Weaviate client and collection"""
        try:
            # Connect to Weaviate Cloud
            self.weaviate_client = weaviate.connect_to_weaviate_cloud(
                cluster_url=weaviate_url,
                auth_credentials=weaviate.auth.AuthApiKey(weaviate_api_key),
            )
            
            # Check if collection exists, if not create it
            if not self.weaviate_client.collections.exists(self.collection_name):
                print(f"📂 Creating new collection: {self.collection_name}")
                self.collection = self.weaviate_client.collections.create(
                    name=self.collection_name,
                    vectorizer_config=weaviate.classes.config.Configure.Vectorizer.none(),
                    vector_index_config=weaviate.classes.config.Configure.VectorIndex.hnsw(
                        distance_metric=weaviate.classes.config.VectorDistances.COSINE
                    ),
                    properties=[
                        weaviate.classes.config.Property(
                            name="content",
                            data_type=weaviate.classes.config.DataType.TEXT
                        ),
                        weaviate.classes.config.Property(
                            name="file_id",
                            data_type=weaviate.classes.config.DataType.TEXT
                        ),
                        weaviate.classes.config.Property(
                            name="filename",
                            data_type=weaviate.classes.config.DataType.TEXT
                        ),
                        weaviate.classes.config.Property(
                            name="file_type",
                            data_type=weaviate.classes.config.DataType.TEXT
                        ),
                        weaviate.classes.config.Property(
                            name="chunk_index",
                            data_type=weaviate.classes.config.DataType.INT
                        ),
                        weaviate.classes.config.Property(
                            name="user_id",
                            data_type=weaviate.classes.config.DataType.TEXT
                        ),
                        weaviate.classes.config.Property(
                            name="chat_history_id",
                            data_type=weaviate.classes.config.DataType.TEXT
                        )
                    ]
                )
            else:
                print(f"📂 Using existing collection: {self.collection_name}")
                self.collection = self.weaviate_client.collections.get(self.collection_name)
            
            print("✅ Weaviate connection established")
            
        except Exception as e:
            print(f"❌ Error initializing Weaviate: {e}")
            self.weaviate_client = None
            self.collection = None
    
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
    
    def generate_summary_from_chunks(self, chat_history_id: str, file_id: str):
        """Generate summary from chunks associated with a file (background task)"""

        try:
            # Query chunks by file_id
            response = self.collection.query.fetch_objects(
                filters=weaviate.classes.query.Filter.by_property("file_id").equal(file_id),
                return_metadata=MetadataQuery(distance=True)
            )
            
            if not response.objects:
                print(f"⚠️ No chunks found for file_id {file_id}")
                return

            # Collect content
            content_parts = []
            for obj in response.objects:
                content_parts.append(obj.properties["content"])
            
            content = "\n".join(content_parts)

            # Create thread to update content to files table
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

    def store_documents(self, contents, file_id: str, filename: str, file_type: str = None):
        """Store documents from a specific file"""
            
        loader = ParallelLoader(file_content=contents, max_workers=4)
        print(f"📂 Loading {filename}...")
        doc_chunks = loader.load_chunks()
        print(f"📂 {len(doc_chunks)} chunks loaded")
        
        print(f"📊 Processing {len(doc_chunks)} chunks from {filename}...")
        
        try:
            # Prepare batch data for Weaviate
            batch_data = []
            embeddings = self.embedding_model.embed_documents([doc.page_content for doc in doc_chunks])
            
            for i, (doc, embedding) in enumerate(zip(doc_chunks, embeddings)):
                data_object = {
                    "content": doc.page_content,
                    "file_id": file_id,
                    "filename": filename,
                    "file_type": file_type or "unknown",
                    "chunk_index": i,
                    "user_id": self.user_id,
                    "chat_history_id": self.chat_history_id
                }
                batch_data.append(weaviate.classes.data.DataObject(
                    properties=data_object,
                    vector=embedding
                ))
            
            # Insert in batches
            batch_size = 100
            for i in range(0, len(batch_data), batch_size):
                batch = batch_data[i:i + batch_size]
                try:
                    self.collection.data.insert_many(batch)
                    print(f"📊 Inserted batch {i//batch_size + 1}/{(len(batch_data) + batch_size - 1)//batch_size}")
                except Exception as e:
                    print(f"❌ Error inserting batch: {e}")
            
            # Update file manager
            self.file_manager.add_file(file_id, filename, file_type)
            self.file_manager.files_info[file_id]['chunk_count'] = len(doc_chunks)
            self.file_manager.save_files_info()
            
            # Thread to create summary
            threading.Thread(
                target=self.generate_summary_from_chunks,
                args=(self.chat_history_id, file_id,),
                daemon=True
            ).start()

            print(f"✅ Successfully stored {len(doc_chunks)} chunks for {filename}")
            return True
            
        except Exception as e:
            print(f"❌ Error storing documents: {e}")
            return False

    def remove_file_documents(self, file_id: str):
        """Remove all documents from a specific file"""
        
        try:
            # Delete documents by file_id
            self.collection.data.delete_many(
                filters=weaviate.classes.query.Filter.by_property("file_id").equal(file_id)
            )
            
            # Remove from file manager
            filename = self.file_manager.get_file_info(file_id).get('filename', 'Unknown')
            self.file_manager.remove_file(file_id)
            
            print(f"✅ Removed all chunks from {filename}")
            return True
                
        except Exception as e:
            print(f"❌ Error removing documents: {e}")
            return False

    def retrieve_documents(self, query: str, k: int = 5, file_ids: List[str] = None):
        """Retrieve relevant documents, optionally filtered by file_ids"""
        
        try:
            # Get query embedding
            query_embedding = self.embedding_model.embed_query(query)
            
            # Build where filter
            where_filter = weaviate.classes.query.Filter.by_property("chat_history_id").equal(self.chat_history_id)
            if file_ids:
                file_filter = weaviate.classes.query.Filter.by_property("file_id").contains_any(file_ids)
                where_filter = where_filter & file_filter
            
            # Perform vector search
            response = self.collection.query.near_vector(
                near_vector=query_embedding,
                limit=k,
                filters=where_filter,
                return_metadata=MetadataQuery(distance=True)
            )
            
            # Convert to Document objects
            docs = []
            for obj in response.objects:
                props = obj.properties
                doc = Document(
                    page_content=props["content"],
                    metadata={
                        "file_id": props["file_id"],
                        "filename": props["filename"],
                        "file_type": props["file_type"],
                        "chunk_index": props["chunk_index"],
                        "distance": obj.metadata.distance if obj.metadata else None
                    }
                )
                docs.append(doc)
            
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

        return response
    
    def __del__(self):
        """Close Weaviate connection when object is destroyed"""
        if self.weaviate_client:
            try:
                self.weaviate_client.close()
            except:
                pass