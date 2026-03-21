<?php

namespace App\Http\Controllers;

use App\Models\Item;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class ItemController
{
    public function dashboard(): View
    {
        $items = Item::orderBy('created_at', 'desc')->get();
        return view('dashboard', ['items' => $items]);
    }

    public function index(): JsonResponse
    {
        $items = Item::orderBy('created_at', 'desc')->get();
        return response()->json($items->toArray());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->json()->all();
        $title = trim($data['title'] ?? '');

        if (empty($title)) {
            return response()->json(['error' => 'Title is required'], 400);
        }

        $item = Item::create([
            'title' => $title,
            'description' => trim($data['description'] ?? ''),
            'status' => $data['status'] ?? 'active',
        ]);

        return response()->json($item->toArray(), 201);
    }

    public function show(int $id): JsonResponse
    {
        $item = Item::find($id);

        if (!$item) {
            return response()->json(['error' => 'Item not found'], 404);
        }

        return response()->json($item->toArray());
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $item = Item::find($id);

        if (!$item) {
            return response()->json(['error' => 'Item not found'], 404);
        }

        $data = $request->json()->all();

        if (array_key_exists('title', $data)) {
            $title = trim($data['title']);
            if (empty($title)) {
                return response()->json(['error' => 'Title cannot be empty'], 400);
            }
            $item->title = $title;
        }

        if (array_key_exists('description', $data)) {
            $item->description = trim($data['description']);
        }

        if (array_key_exists('status', $data)) {
            $item->status = $data['status'];
        }

        $item->save();

        return response()->json($item->fresh()->toArray());
    }

    public function destroy(int $id): JsonResponse
    {
        $item = Item::find($id);

        if (!$item) {
            return response()->json(['error' => 'Item not found'], 404);
        }

        $item->delete();

        return response()->json(['message' => 'Item deleted']);
    }
}
