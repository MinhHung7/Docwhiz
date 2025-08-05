# from authlib.integrations.starlette_client import OAuth
# from starlette.config import Config
# from dotenv import load_dotenv
# import os

# load_dotenv()  # Load biến môi trường từ .env

# # Tạo Config từ os.environ (mặc định)
# config = Config()

# oauth = OAuth(config)
# oauth.register(
#     name='google',
#     client_id=config('GOOGLE_CLIENT_ID'),
#     client_secret=config('GOOGLE_CLIENT_SECRET'),
#     server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
#     client_kwargs={'scope': 'openid email profile'},
# )
