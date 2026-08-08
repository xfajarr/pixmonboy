/**
 * `DiskRegistry` ABI, GENERATED from `contracts/out/DiskRegistry.sol/DiskRegistry.json`.
 *
 * Do not hand-edit and do not hand-write one of these. A mistyped ABI does not
 * fail loudly: it encodes a different selector and the call reverts on chain
 * with a message that points nowhere, which is the worst kind of bug to meet at
 * 16:00 on a Saturday.
 *
 * Regenerate with:  bun run --cwd packages/sdk generate:abi
 *
 * `as const` is load bearing. viem reads the literal types out of it to make
 * `writeContract` argument-checked at compile time; widen it to `Abi` and every
 * call site silently accepts anything.
 */
export const diskRegistryAbi = [
  {
    type: 'function',
    name: 'createDisk',
    inputs: [
      {
        name: 'name',
        type: 'bytes12',
        internalType: 'bytes12',
      },
      {
        name: 'difficulty',
        type: 'uint8',
        internalType: 'uint8',
      },
      {
        name: 'godMode',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    outputs: [
      {
        name: 'diskId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'diskIdsOf',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256[]',
        internalType: 'uint256[]',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDisk',
    inputs: [
      {
        name: 'diskId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct DiskRegistry.Disk',
        components: [
          {
            name: 'owner',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'name',
            type: 'bytes12',
            internalType: 'bytes12',
          },
          {
            name: 'createdAt',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'bestScore',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'bestDamage',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'runs',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'difficulty',
            type: 'uint8',
            internalType: 'uint8',
          },
          {
            name: 'flags',
            type: 'uint8',
            internalType: 'uint8',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'recordRun',
    inputs: [
      {
        name: 'diskId',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'score',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: 'damage',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: 'durationSeconds',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'inRangeBps',
        type: 'uint16',
        internalType: 'uint16',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'totalDisks',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'DiskCreated',
    inputs: [
      {
        name: 'diskId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'owner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'name',
        type: 'bytes12',
        indexed: false,
        internalType: 'bytes12',
      },
      {
        name: 'difficulty',
        type: 'uint8',
        indexed: false,
        internalType: 'uint8',
      },
      {
        name: 'godMode',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'RunRecorded',
    inputs: [
      {
        name: 'diskId',
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'owner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'score',
        type: 'uint64',
        indexed: false,
        internalType: 'uint64',
      },
      {
        name: 'damage',
        type: 'uint64',
        indexed: false,
        internalType: 'uint64',
      },
      {
        name: 'durationSeconds',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
      {
        name: 'inRangeBps',
        type: 'uint16',
        indexed: false,
        internalType: 'uint16',
      },
      {
        name: 'timestamp',
        type: 'uint64',
        indexed: false,
        internalType: 'uint64',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'BadDifficulty',
    inputs: [],
  },
  {
    type: 'error',
    name: 'DiskNotFound',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotDiskOwner',
    inputs: [],
  },
] as const
