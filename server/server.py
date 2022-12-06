from flask import Flask, session
from routers import admin
from routers import forbush

app = Flask('aides')

app.register_blueprint(admin.bp)
app.register_blueprint(forbush.bp)
