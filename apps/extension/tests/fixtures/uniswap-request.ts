import type { WalletConfig } from "../../src/lib/config.ts";
import type { SignPendingRequest } from "../../src/lib/requestStore.ts";

export const ADDRESS = "0x1b3984868782b69d1aae816f437a13b4b674cb66";

/** Account xpub at m/44'/60'/0'/0/0 (fingerprint 4418d0b4). */
export const XPUB =
  "xpub6H6LG2We64bdwqNF7gNkUJ5EvDibiT2gbs77oonbawV86XE3eMxZf9czGQ9CPdSzsdsHLnLEjiJJEDnFMAyLrWATesaVbTYeggBXMHaFKLg";

/** Raw request JSON shown in the UI ("Request JSON (before encoding)"). */
export const RAW_JSON = {
  origin: "https://app.uniswap.org",
  chain: "ethereum",
  address: ADDRESS,
  wallet: {
    path: "",
    xpub: XPUB,
  },
  signerRequest: {
    address: ADDRESS,
    chain: "ethereum",
    chainId: "0xa4b1",
    payload:
      '{"chainId":"0xa4b1","gas":"0x2c575","maxFeePerGas":"0x141de70","maxPriorityFeePerGas":"0xf4240","value":"0x0","from":"0x1b3984868782b69d1aae816f437a13b4b674cb66","to":"0xd88f38f930b7952f2db2432cb002e7abbf3dd869","data":"0xdd46508f0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000006a8658900000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000002011100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000002fd90000000000000000000000000000000000000000000000000000000007d3f6b9e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006553f0ff00000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000002f2a2543b76a4166549f7aab2e75bef0aefc5b0f000000000000000000000000af88d065e77c8cc2239327c5edb3a432268e58310000000000000000000000000000000000000000000000000000000000000001"}',
    type: "transaction",
    version: 1,
  },
} as const;

/** The exact 5 parts captured from the UI. */
export const CAPTURED_PARTS = [
  "ur:eth-sign-request/1-5/lpadahcfaxsacyurenfnsohdseoladtpdaoeiejykkjoihiyfwkpiyiyihjpieiehsjyhsmhcsfecsskcsmwcsrscszecshlcsfpcszecsnycsflcscacsnycseccsgdcshecsmeaooeiejykkjoihiyfwkpiyiyihjpieiehsjyhsnlaoteaocsytaocstkcslfcsoxcspacslacslsbscsfwcsfzcslradcsfpcsuecsjocslsaocsskcskpcsmwcstpcsmycsetcsytcsdycsrlcsmdcsdlcsdpcsprcsfxcsdwcspfaocsvdcspycsrscsfscstpcsincslacsrhaocsoxcsutcsfgcsgdcsmyaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaefzvscewk",
  "ur:eth-sign-request/2-5/lpaoahcfaxsacyurenfnsohdseaeaeaeaeaeaeaeaecsfzaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaecsimcslncshdcsmhaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaocsfzaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaecsfzaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaecslaaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaoadbyaeaeaeaeaeaeaeaeaeaeaeaeaeaendoevwgs",
  "ur:eth-sign-request/3-5/lpaxahcfaxsacyurenfnsohdseaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaoaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaecsfzaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeadcscxaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaecsrtaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaocszccsmhaeaeaeaeaeaeaeaeaeaeaeaerfcakpgd",
  "ur:eth-sign-request/4-5/lpaaahcfaxsacyurenfnsohdseaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaecskicsfhcsjecsnnaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaecsihcsgucswtcszmaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaecsnbaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaecshnaeaeaefysetohs",
  "ur:eth-sign-request/5-5/lpahahcfaxsacyurenfnsohdseaeaeaeaeaeaeaeaeaecsdlcsdrcsdacsfxcsrlcsimcsfpcsiycsghcsnecskncspycsdmcskpcsrncswtcsplcsztcshpbsaeaeaeaeaeaeaeaeaeaeaeaecspecslocsticsihcsvdcskecslkcssacscncsmucsdicsskcswecsqdcsoxcseycsdscsmncshdcsehaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeadcsrtaxaaaacfoxpaahtaaddyoeadlecsdwykcsfnykaeykaewkaewkaocymumtnlreatktisjyjyjojkftdldlhsjojodmkpjtinjkkthsjodmjljpioaeaeaebavouejk",
];

export const WALLET: WalletConfig = {
  id: "w_uniswap",
  chain: "ethereum",
  address: ADDRESS,
  signer: "keystone-qr",
  label: "",
  createdAt: 0,
  path: RAW_JSON.wallet.path,
  xpub: RAW_JSON.wallet.xpub,
};

export function buildRequest(): SignPendingRequest {
  return {
    id: "req_uniswap",
    kind: "sign",
    chain: "ethereum",
    method: "eth_sendTransaction",
    params: [],
    origin: RAW_JSON.origin,
    address: ADDRESS,
    signer: "keystone-qr",
    status: "pending",
    createdAt: 0,
    expiresAt: 0,
    transport: "",
    signerRequest: RAW_JSON.signerRequest,
  } as unknown as SignPendingRequest;
}
