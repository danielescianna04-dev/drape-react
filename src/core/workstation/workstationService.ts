import { collection, addDoc, getDocs, query, orderBy } from 'firebase/firestore';
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
};
