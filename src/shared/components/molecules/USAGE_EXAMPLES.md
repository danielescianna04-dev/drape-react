# Agent Components Usage Examples

## AgentModeModal

Modal for selecting between Fast and Planning execution modes.

```tsx
import { AgentModeModal } from '@/shared/components/molecules';
import { useState } from 'react';

function MyComponent() {
    const [showModeModal, setShowModeModal] = useState(false);

    const handleSelectMode = (mode: 'fast' | 'planning') => {
        console.log('Selected mode:', mode);
        setShowModeModal(false);
        // Handle mode selection
    };

    return (
        <>
            <Button onPress={() => setShowModeModal(true)}>
                Select Mode
            </Button>

            <AgentModeModal
                visible={showModeModal}
                onClose={() => setShowModeModal(false)}
                onSelectMode={handleSelectMode}
            />
        </>
    );
}
```

## PlanApprovalModal

Modal for reviewing and approving execution plans.

```tsx
import { PlanApprovalModal, Plan } from '@/shared/components/molecules';
import { useState } from 'react';

function MyComponent() {
    const [showPlanModal, setShowPlanModal] = useState(false);

    const plan: Plan = {
        title: 'Create user authentication system',
        steps: [
            'Create user model and database schema',
            'Implement login/signup endpoints',
            'Add JWT token generation and validation',
            'Create protected route middleware',
            'Add password hashing with bcrypt'
        ],
        estimated_files: 8,
        technologies: ['React Native', 'TypeScript', 'JWT']
    };

    const handleApprove = () => {
        console.log('Plan approved');
        setShowPlanModal(false);
        // Execute the plan
    };

    const handleReject = () => {
        console.log('Plan rejected');
        setShowPlanModal(false);
        // Handle rejection
    };

    return (
        <PlanApprovalModal
            visible={showPlanModal}
            plan={plan}
            onApprove={handleApprove}
            onReject={handleReject}
            onClose={() => setShowPlanModal(false)}
        />
    );
}
```

## AgentStatusBadge

Compact badge showing agent execution status.

```tsx
import { AgentStatusBadge } from '@/shared/components/molecules';

function MyComponent() {
    const [isRunning, setIsRunning] = useState(false);
    const [currentTool, setCurrentTool] = useState<string | null>(null);
    const [iteration, setIteration] = useState(0);

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text>Agent Status:</Text>
            <AgentStatusBadge
                isRunning={isRunning}
                currentTool={currentTool}
                iteration={iteration}
            />
        </View>
    );
}

// Example with running state
<AgentStatusBadge
    isRunning={true}
    currentTool="write_file"
    iteration={3}
/>

// Example with idle state
<AgentStatusBadge
    isRunning={false}
/>
```

## Supported Tools for AgentStatusBadge

The badge automatically recognizes these tool types:
- `write_file` - Scrittura (document icon)
- `read_file` - Lettura (book icon)
- `list_directory` - Navigazione (folder icon)
- `run_command` - Esecuzione (flash icon)
- `edit_file` - Modifica (create icon)
- `signal_completion` - Completamento (checkmark icon)
- `search_files` - Ricerca (search icon)
- `code_analysis` - Analisi (code icon)

## Design Features

All components feature:
- Dark theme matching AppColors
- Smooth animations (pulsing, fading)
- Ionicons integration
- Responsive design
- Touch feedback
- Accessibility support
- Italian language labels
