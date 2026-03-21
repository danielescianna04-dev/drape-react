import os

from flask import Flask, render_template, request, jsonify

from models import db, Item

app = Flask(__name__)

# ── Database config ──────────────────────────────────────────
db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.db")
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = "dev-secret-change-in-production"

db.init_app(app)


# ── Seed data ────────────────────────────────────────────────
def seed_data():
    if Item.query.count() == 0:
        seeds = [
            Item(
                title="Welcome to Cloud Mode",
                description="This is your first item. Edit or delete it to get started.",
                status="active",
            ),
            Item(
                title="Build Something Amazing",
                description="Use the dashboard to manage your items with full CRUD support.",
                status="active",
            ),
            Item(
                title="Deploy with Confidence",
                description="SQLite database persists your data. Ready for production with minimal setup.",
                status="completed",
            ),
        ]
        db.session.add_all(seeds)
        db.session.commit()


# ── Initialize DB ────────────────────────────────────────────
with app.app_context():
    db.create_all()
    seed_data()


# ── Pages ────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/about")
def about():
    return render_template("about.html")


@app.route("/dashboard")
def dashboard():
    items = Item.query.order_by(Item.created_at.desc()).all()
    return render_template("dashboard.html", items=items)


# ── API: List items ──────────────────────────────────────────
@app.route("/api/items", methods=["GET"])
def list_items():
    items = Item.query.order_by(Item.created_at.desc()).all()
    return jsonify([item.to_dict() for item in items])


# ── API: Create item ─────────────────────────────────────────
@app.route("/api/items", methods=["POST"])
def create_item():
    data = request.get_json()
    if not data or not data.get("title", "").strip():
        return jsonify({"error": "Title is required"}), 400

    item = Item(
        title=data["title"].strip(),
        description=data.get("description", "").strip(),
        status=data.get("status", "active"),
    )
    db.session.add(item)
    db.session.commit()
    return jsonify(item.to_dict()), 201


# ── API: Get single item ─────────────────────────────────────
@app.route("/api/items/<int:item_id>", methods=["GET"])
def get_item(item_id):
    item = db.session.get(Item, item_id)
    if not item:
        return jsonify({"error": "Item not found"}), 404
    return jsonify(item.to_dict())


# ── API: Update item ─────────────────────────────────────────
@app.route("/api/items/<int:item_id>", methods=["PUT"])
def update_item(item_id):
    item = db.session.get(Item, item_id)
    if not item:
        return jsonify({"error": "Item not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    if "title" in data:
        if not data["title"].strip():
            return jsonify({"error": "Title cannot be empty"}), 400
        item.title = data["title"].strip()
    if "description" in data:
        item.description = data["description"].strip()
    if "status" in data:
        item.status = data["status"]

    db.session.commit()
    return jsonify(item.to_dict())


# ── API: Delete item ─────────────────────────────────────────
@app.route("/api/items/<int:item_id>", methods=["DELETE"])
def delete_item(item_id):
    item = db.session.get(Item, item_id)
    if not item:
        return jsonify({"error": "Item not found"}), 404

    db.session.delete(item)
    db.session.commit()
    return jsonify({"message": "Item deleted"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)
