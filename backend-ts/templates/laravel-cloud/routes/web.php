<?php

use App\Http\Controllers\ItemController;
use App\Http\Controllers\PageController;
use Illuminate\Support\Facades\Route;

Route::get('/', [PageController::class, 'home'])->name('home');
Route::get('/about', [PageController::class, 'about'])->name('about');
Route::get('/dashboard', [ItemController::class, 'dashboard'])->name('dashboard');

Route::get('/api/items', [ItemController::class, 'index']);
Route::post('/api/items', [ItemController::class, 'store']);
Route::get('/api/items/{id}', [ItemController::class, 'show']);
Route::put('/api/items/{id}', [ItemController::class, 'update']);
Route::delete('/api/items/{id}', [ItemController::class, 'destroy']);
