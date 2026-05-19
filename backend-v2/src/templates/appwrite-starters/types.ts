export type AppwriteAttrType =
  | 'string'
  | 'integer'
  | 'boolean'
  | 'datetime'
  | 'email'
  | 'url'
  | 'enum';

export interface AppwriteAttr {
  key: string;
  type: AppwriteAttrType;
  required?: boolean;
  default?: any;
  array?: boolean;
  size?: number;
  elements?: string[];
}

export interface AppwriteIndex {
  key: string;
  type: 'key' | 'fulltext' | 'unique';
  attributes: string[];
}

export interface AppwriteCollectionSchema {
  id: string;
  name: string;
  attributes: AppwriteAttr[];
  indexes?: AppwriteIndex[];
}

export interface AppwriteStarterTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  collections: AppwriteCollectionSchema[];
  /** snippet di codice JS di esempio per inizializzazione client Appwrite nel codice utente */
  sampleClientSnippet: string;
}
