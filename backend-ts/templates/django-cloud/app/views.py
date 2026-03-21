import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import Item


def home(request):
    return render(request, "home.html")


def about(request):
    return render(request, "about.html")


def dashboard(request):
    items = Item.objects.all()
    return render(request, "dashboard.html", {"items": items})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def api_items(request):
    if request.method == "GET":
        items = Item.objects.all()
        return JsonResponse([item.to_dict() for item in items], safe=False)

    # POST
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    title = data.get("title", "").strip()
    if not title:
        return JsonResponse({"error": "Title is required"}, status=400)

    item = Item.objects.create(
        title=title,
        description=data.get("description", "").strip(),
        status=data.get("status", "active"),
    )
    return JsonResponse(item.to_dict(), status=201)


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def api_item_detail(request, item_id):
    try:
        item = Item.objects.get(pk=item_id)
    except Item.DoesNotExist:
        return JsonResponse({"error": "Item not found"}, status=404)

    if request.method == "GET":
        return JsonResponse(item.to_dict())

    if request.method == "DELETE":
        item.delete()
        return JsonResponse({"message": "Item deleted"})

    # PUT
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    if "title" in data:
        if not data["title"].strip():
            return JsonResponse({"error": "Title cannot be empty"}, status=400)
        item.title = data["title"].strip()
    if "description" in data:
        item.description = data["description"].strip()
    if "status" in data:
        item.status = data["status"]

    item.save()
    return JsonResponse(item.to_dict())
