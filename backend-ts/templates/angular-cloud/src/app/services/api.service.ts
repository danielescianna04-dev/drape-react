import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Item {
  id: number;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateItemDto {
  title: string;
  description?: string;
  status?: string;
}

export interface UpdateItemDto {
  title?: string;
  description?: string;
  status?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private apiUrl = 'http://localhost:3001/api';

  constructor(private http: HttpClient) {}

  getItems(status?: string): Observable<Item[]> {
    const params = status ? `?status=${status}` : '';
    return this.http.get<Item[]>(`${this.apiUrl}/items${params}`);
  }

  getItem(id: number): Observable<Item> {
    return this.http.get<Item>(`${this.apiUrl}/items/${id}`);
  }

  createItem(data: CreateItemDto): Observable<Item> {
    return this.http.post<Item>(`${this.apiUrl}/items`, data);
  }

  updateItem(id: number, data: UpdateItemDto): Observable<Item> {
    return this.http.put<Item>(`${this.apiUrl}/items/${id}`, data);
  }

  deleteItem(id: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/items/${id}`);
  }
}
