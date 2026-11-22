import { useEffect, useState } from 'react';
import { resolveInviteLink } from '../../api/circle';
import { useRoleMode } from '../../context/RoleMode';
import { useSession } from '../../context/SessionContext';
import { markOnboardingDone } from '../../utils/onboardingTour';
import CheckDiscountsScreen from './CheckDiscountsScreen';
import ChoiceScreen from './ChoiceScreen';
import EarnPreviewScreen from './EarnPreviewScreen';
import InviteFriendsScreen from './InviteFriendsScreen';

export default function OnboardingTour({ onDone, inviteCode }) {
  const { sessionId, user } = useSession();
  const { setMode } = useRoleMode();
  const [step, setStep] = useState('choice');
  const [path, setPath] = useState('save');
  const [linkInvite, setLinkInvite] = useState(null);

  useEffect(() => {
    if (!inviteCode || !sessionId || !user?.id) return undefined;
    let live = true;
    resolveInviteLink(sessionId, user.id, inviteCode).then((payload) => {
      if (live && payload?.inviter_id) setLinkInvite(payload);
    }).catch(() => {});
    return () => { live = false; };
  }, [inviteCode, sessionId, user?.id]);

  const finish = async (mode) => {
    setMode(mode === 'holder' ? 'holder' : 'requester');
    await markOnboardingDone(user.id);
    onDone();
  };

  if (step === 'choice') {
    return (
      <ChoiceScreen
        onSave={() => {
          setMode('requester');
          setPath('save');
          setStep('save');
        }}
        onShare={() => {
          setMode('holder');
          setPath('earn');
          setStep('earn');
        }}
        onSkip={() => finish('requester')}
      />
    );
  }

  if (step === 'save') {
    return (
      <CheckDiscountsScreen
        onInvite={() => setStep('invite')}
        onSkip={() => finish('requester')}
      />
    );
  }

  if (step === 'earn') {
    return (
      <EarnPreviewScreen
        onInvite={() => setStep('invite')}
        onSkip={() => finish('holder')}
      />
    );
  }

  return (
    <InviteFriendsScreen
      onBack={() => setStep(path === 'earn' ? 'earn' : 'save')}
      onSkip={() => finish(path === 'earn' ? 'holder' : 'requester')}
      linkInvite={linkInvite}
    />
  );
}
