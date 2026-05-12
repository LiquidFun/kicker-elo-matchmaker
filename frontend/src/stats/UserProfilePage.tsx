import { useParams } from 'react-router-dom';

export default function UserProfilePage() {
  const { userId } = useParams();
  return (
    <div className="flex h-full items-center justify-center text-white/60">
      User {userId} profile (coming in M5)
    </div>
  );
}
