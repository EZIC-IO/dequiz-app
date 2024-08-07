import { useEffect, useState } from 'react';
import { BadgeCent, Wand } from 'lucide-react';
import { useWriteContract } from 'wagmi';
import { toEther } from 'thirdweb/utils';
import { base } from 'thirdweb/chains';
import { Hex } from 'thirdweb';
import {
  useActiveAccount,
  useActiveWalletChain,
  useConnectModal,
  useContractEvents,
  useSwitchActiveWalletChain,
} from 'thirdweb/react';
import { useRouter } from 'next/navigation';

import {
  GenerationAction,
  GenerationActionStatus,
} from '@/api/models/generation.dto';
import { abi } from '@/config/abi';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { contract, contractAddress } from '@/constants/contract';
import { useReportSuccessfulMint } from '@/api/hooks/useReportSuccessfulMint';
import useGetQuizContractData from '@/api/hooks/useGetQuizContractData';
import { thirdwebClient } from '@/config/thirdweb';
import { wallets } from '@/constants/wallets';
import ShimmerButton from '@/components/ui/shimmer-button';
import IconEth from '@/components/icons/IconEth';
import { BadgedImage } from '@/components/ui/badged-image';

type Props = {
  open: boolean;
  isLoading: boolean;
  mintPrice: bigint;
  generationAction?: GenerationAction;
};

const NftPreview = (props: Props) => {
  const { isLoading, open, mintPrice, generationAction } = props;

  const router = useRouter();

  const [mintTx, setMintTx] = useState('');
  const [isMinting, setIsMinting] = useState(false);

  const { isConnected } = useGetQuizContractData();
  const account = useActiveAccount();
  const chain = useActiveWalletChain();
  const { connect } = useConnectModal();
  const switchChain = useSwitchActiveWalletChain();

  const { writeContract: mint } = useWriteContract({
    mutation: {
      onSuccess: (tx) => setMintTx(tx),
      onError: (e) => {
        setIsMinting(false);
        console.error('Error minting', e);
      },
    },
  });

  const { data: contractEvents } = useContractEvents({
    contract,
    enabled: !!mintTx,
    events: [
      {
        hash: mintTx as Hex,
        topics: [],
        abiEvent: {
          anonymous: false,
          inputs: [
            {
              indexed: true,
              internalType: 'address',
              name: '_from',
              type: 'address',
            },
            {
              indexed: false,
              internalType: 'uint256',
              name: '_tokenId',
              type: 'uint256',
            },
          ],
          name: 'MintSuccessful',
          type: 'event',
        },
      },
    ],
  });

  const { reportSuccessfulMint } = useReportSuccessfulMint({
    onSuccess: (data) => {
      if (data?.status === GenerationActionStatus.MINTED) {
        router.replace('/minted');
      }
    },
    onError: () => setIsMinting(false),
  });

  const isCorrectChain = chain?.id === base.id;

  useEffect(() => {
    if (contractEvents?.length) {
      const event = contractEvents.find(
        (event) =>
          event.eventName === 'MintSuccessful' &&
          event.transactionHash === mintTx &&
          event.args._from === account?.address
      );

      if (event && event.args._tokenId && generationAction?._id && mintTx) {
        reportSuccessfulMint({
          nftTokenId: Number(event.args._tokenId),
          genActionId: generationAction?._id,
          mintTx,
        });
      }
    }
  }, [contractEvents, account, generationAction, mintTx, reportSuccessfulMint]);

  const handleChangeNetwork = () => {
    switchChain(base);
  };

  const handleMint = async () => {
    if (isMinting) return;

    setIsMinting(true);

    mint({
      abi,
      functionName: 'safeMint',
      address: contractAddress,
      args: [generationAction?.metadataBareIPFS],
      value: mintPrice,
      chainId: base.id,
    });
  };

  const handleConnect = async () => {
    try {
      await connect({ client: thirdwebClient, wallets });
    } catch (e) {
      console.error(e);
    }
  };

  const renderActionButton = () => {
    if (!isConnected) {
      return (
        <ShimmerButton onClick={handleConnect}>Connect to mint</ShimmerButton>
      );
    }

    if (!isCorrectChain) {
      return (
        <ShimmerButton onClick={handleChangeNetwork}>
          Change Network
        </ShimmerButton>
      );
    }

    return (
      <ShimmerButton
        className='flex gap-2'
        disabled={isMinting}
        onClick={handleMint}
      >
        {isMinting ? 'Minting...' : 'Mint'}
        <BadgeCent size={16} />
      </ShimmerButton>
    );
  };

  return (
    <Drawer dismissible={false} open={open}>
      <DrawerContent className='bg-black'>
        <div className='flex h-full w-full flex-col items-center justify-center px-10 py-16'>
          {isLoading ? (
            <>
              <Wand size={60} color='#fff' />

              <div className='font-tangak max-w-[805px] pt-10 text-center text-5xl font-extrabold leading-tight'>
                We are preparing your NFT.
                <br />
                Please do not close this page.
              </div>
            </>
          ) : (
            generationAction && (
              <div className='flex gap-10'>
                <BadgedImage
                  width={299}
                  height={311}
                  className='shadow-blue rounded-[10px]'
                  alt={generationAction.metadata.name}
                  src={generationAction.imageGatewayIPFS}
                  title={generationAction.metadata.name}
                />

                <div>
                  <h4 className='font-tangak text-3xl'>Your NFT is ready!</h4>

                  <div className='mt-10'>{renderActionButton()}</div>

                  <div className='mt-4 flex gap-1'>
                    <IconEth />
                    <span>{toEther(mintPrice)} ETH</span>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default NftPreview;
