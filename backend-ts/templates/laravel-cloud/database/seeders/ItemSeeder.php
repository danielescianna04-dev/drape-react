<?php

namespace Database\Seeders;

use App\Models\Item;
use Illuminate\Database\Seeder;

class ItemSeeder extends Seeder
{
    public function run(): void
    {
        if (Item::count() > 0) {
            return;
        }

        Item::insert([
            [
                'title' => 'Welcome to Cloud Mode',
                'description' => 'This is your first item. Edit or delete it to get started.',
                'status' => 'active',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'title' => 'Build Something Amazing',
                'description' => 'Use the dashboard to manage your items with full CRUD support.',
                'status' => 'active',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'title' => 'Deploy with Confidence',
                'description' => 'SQLite database persists your data. Ready for production with minimal setup.',
                'status' => 'completed',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }
}
