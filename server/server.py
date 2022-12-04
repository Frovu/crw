from flask import Flask, session
from routers import admin

app = Flask('aides')

app.register_blueprint(admin.bp)
