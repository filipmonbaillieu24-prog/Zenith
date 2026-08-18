import React from 'react';
import { CoachPanel } from '../workout/CoachPanel';
import { FitnessProfile, RideSummaryWithBests } from '../../types/workout';

import { SavedLocation } from '../../types/route';

interface CoachTabProps {
  rides: RideSummaryWithBests[];
  profile: FitnessProfile;
  onProfileChange: (p: FitnessProfile) => void;
  onActiveWorkoutChange: (workout: any | null) => void;
  onGenerateTrainingsroute: (params: any) => void;
  savedLocations: SavedLocation[];
}

export const CoachTab: React.FC<CoachTabProps> = ({ 
  rides, profile, onProfileChange,
  onActiveWorkoutChange, onGenerateTrainingsroute, savedLocations
}) => {
  return (
    <div className="wd-main-single">
      <div className="wd-coach-header" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', margin: '0 0 4px' }}>AI Trainingscoach</h2>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Personalized advice based on your physiology and trends.</p>
      </div>
      <CoachPanel 
        rides={rides} 
        profile={profile} 
        onProfileChange={onProfileChange} 
        onActiveWorkoutChange={onActiveWorkoutChange}
        onGenerateTrainingsroute={onGenerateTrainingsroute}
        savedLocations={savedLocations}
      />
    </div>
  );
};
