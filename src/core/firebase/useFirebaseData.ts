import { useEffect } from 'react';
import { useTerminalStore } from '../terminal/terminalStore';
import { ProjectService } from './projectService';

export const useFirebaseData = () => {
  const { loadWorkstations, setProjectFolders } = useTerminalStore();

  useEffect(() => {
    const loadData = async () => {
      try {
        
        const [workstations, folders] = await Promise.all([
          ProjectService.loadWorkstations(),
          ProjectService.loadFolders()
        ]);
        
        
        loadWorkstations(workstations);
        setProjectFolders(folders);
        
      } catch (error) {
        console.error('❌ Error loading Firebase data:', error);
      }
    };

    loadData();
  }, []);
};
