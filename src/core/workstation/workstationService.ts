import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { WorkstationInfo } from '../../shared/types';

const COLLECTION = 'workstations';

export const workstationService = {
  async saveWorkstation(workstation: WorkstationInfo): Promise<void> {
    try {
      await addDoc(collection(db, COLLECTION), {
        ...workstation,
        createdAt: new Date(),
      });
    } catch (error) {
      console.error('Error saving workstation:', error);
      throw error;
    }
  },

  async getWorkstations(): Promise<WorkstationInfo[]> {
    try {
      const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
      })) as WorkstationInfo[];
    } catch (error) {
      console.error('Error getting workstations:', error);
      return [];
    }
  },

  async deleteWorkstation(workstationId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, COLLECTION, workstationId));
    } catch (error) {
      console.error('Error deleting workstation:', error);
      throw error;
    }
  },

  async createEmptyWorkstation(name: string): Promise<WorkstationInfo> {
    const workstation: WorkstationInfo = {
      id: 'ws-' + Date.now(),
      name,
      url: '',
      status: 'idle',
      repositoryUrl: '',
      language: 'text',
      createdAt: new Date(),
      files: [],
    };
    await this.saveWorkstation(workstation);
    return workstation;
  },
};
