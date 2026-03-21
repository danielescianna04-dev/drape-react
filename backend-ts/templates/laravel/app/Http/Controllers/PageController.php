<?php

namespace App\Http\Controllers;

use Illuminate\View\View;

class PageController
{
    public function home(): View
    {
        return view('home');
    }

    public function about(): View
    {
        return view('about');
    }
}
