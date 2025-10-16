import { useEffect } from 'react';
import { useTerminalStore } from '../terminal/terminalStore';
import { ProjectService } from './projectService';

export const useFirebaseData = () => {
  const { loadWorkstations, setProjectFolders } = useTerminalStore();

  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('🔥 Loading data from Firebase...');
        
        const [workstations, folders] = await Promise.all([
          ProjectService.loadWorkstations(),
          ProjectService.loadFolders()
        ]);
        
        console.log('📁 Loaded workstations:', workstations.length);
        console.log('📂 Loaded folders:', folders.length);
        
        loadWorkstations(workstations);
        setProjectFolders(folders);
        
        console.log('✅ Firebase data loaded successfully');
      } catch (error) {
        console.error('❌ Error loading Firebase data:', error);
      }
    };

    loadData();
  }, []);
};
