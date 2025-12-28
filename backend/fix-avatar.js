require('dotenv').config();
const flyService = require('./services/fly-service');

async function fixAvatar() {
    const vmId = '784975ec43e718';
    console.log(`🩹 Fixing Avatar.tsx for VM ${vmId} ...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    const avatarContent = `
import React from 'react'

type AvatarProps = {
  src: string
  size?: 'small' | 'medium' | 'large'
}

function Avatar({ src, size = 'medium' }: AvatarProps) {
  const sizeClasses = {
    small: 'h-8 w-8',
    medium: 'h-12 w-12',
    large: 'h-16 w-16'
  }
  return <img src={src} alt="Avatar" className={\`rounded-full \${sizeClasses[size]}\`} />
}

export default Avatar
`;

    const b64 = Buffer.from(avatarContent).toString('base64');

    // Write file
    try {
        await flyService.exec(agentUrl, `echo "${b64}" | base64 -d > /home/coder/project/src/components/Avatar.tsx`, '/home/coder', vmId);
        console.log('✅ Restored src/components/Avatar.tsx');
    } catch (e) {
        console.error('Error:', e.message);
    }
}

fixAvatar();
