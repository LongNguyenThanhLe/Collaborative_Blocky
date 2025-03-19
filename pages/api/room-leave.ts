import type { NextApiRequest, NextApiResponse } from 'next';
import { updateRoomUserList } from '../../lib/collab';

type Data = {
  success: boolean;
  message?: string;
}

/**
 * API endpoint to handle room leave events
 * This is designed to be used with navigator.sendBeacon for reliable cleanup
 * when users navigate away from the workspace
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  // Only accept POST requests (sendBeacon uses POST)
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { roomId, userId } = req.query;
    
    if (!roomId || !userId) {
      return res.status(400).json({ success: false, message: 'Missing roomId or userId' });
    }
    
    // Update room user list to show user has left
    await updateRoomUserList(
      String(roomId),
      String(userId),
      false
    );
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error processing room leave:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}
