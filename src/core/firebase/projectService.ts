import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { WorkstationInfo, ProjectFolder } from '../../shared/types';

const WORKSTATIONS_COLLECTION = 'workstations';
const FOLDERS_COLLECTION = 'project_folders';
const USER_ID = 'current-user'; // TODO: Replace with real user authentication

export class ProjectService {
  // Workstations
  static async saveWorkstation(workstation: WorkstationInfo): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, WORKSTATIONS_COLLECTION), {
        ...workstation,
        userId: USER_ID,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error saving workstation:', error);
      throw error;
    }
  }

  static async loadWorkstations(): Promise<WorkstationInfo[]> {
    try {
      const q = query(
        collection(db, WORKSTATIONS_COLLECTION),
        where('userId', '==', USER_ID)
      );
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WorkstationInfo[];
    } catch (error) {
      console.error('Error loading workstations:', error);
      return [];
    }
  }

  static async deleteWorkstation(workstationId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, WORKSTATIONS_COLLECTION, workstationId));
    } catch (error) {
      console.error('Error deleting workstation:', error);
      throw error;
    }
  }

  static async updateWorkstation(workstationId: string, updates: Partial<WorkstationInfo>): Promise<void> {
    try {
      await updateDoc(doc(db, WORKSTATIONS_COLLECTION, workstationId), {
        ...updates,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Error updating workstation:', error);
      throw error;
    }
  }

  // Project Folders
  static async saveFolder(folder: ProjectFolder): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, FOLDERS_COLLECTION), {
        ...folder,
        userId: USER_ID,
        createdAt: new Date()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error saving folder:', error);
      throw error;
    }
  }

  static async loadFolders(): Promise<ProjectFolder[]> {
    try {
      const q = query(
        collection(db, FOLDERS_COLLECTION),
        where('userId', '==', USER_ID)
      );
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ProjectFolder[];
    } catch (error) {
      console.error('Error loading folders:', error);
      return [];
    }
  }

  static async deleteFolder(folderId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, FOLDERS_COLLECTION, folderId));
    } catch (error) {
      console.error('Error deleting folder:', error);
      throw error;
    }
  }
}
