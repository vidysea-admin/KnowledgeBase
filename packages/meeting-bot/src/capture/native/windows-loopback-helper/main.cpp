// Private stdio protocol only. No endpoint/system-wide fallback and no calibration claim.
#include <windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <propvarutil.h>
#include <wrl.h>
#include <wrl/implements.h>
#include <ksmedia.h>
#include <io.h>
#include <fcntl.h>
#include <atomic>
#include <array>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>
#include <vector>
#include <memory>
#include <cstdio>
#include <cstring>
#include <bit>
using Microsoft::WRL::ComPtr;
using Microsoft::WRL::RuntimeClass;
using Microsoft::WRL::RuntimeClassFlags;
using Microsoft::WRL::ClassicCom;
using Microsoft::WRL::FtmBase;
static void check(HRESULT hr) { if (FAILED(hr)) throw hr; }
static uint64_t filetime(FILETIME t) { return (uint64_t(t.dwHighDateTime) << 32) | t.dwLowDateTime; }
static uint64_t qpc() { LARGE_INTEGER t{}; if (!QueryPerformanceCounter(&t)) throw E_FAIL; return uint64_t(t.QuadPart); }
struct Bracket { uint64_t before, utc, after; };
static Bracket bracket() { Bracket b{}; b.before=qpc(); FILETIME f{}; GetSystemTimePreciseAsFileTime(&f); b.utc=filetime(f); b.after=qpc(); return b; }
class Activation final : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IActivateAudioInterfaceCompletionHandler, FtmBase> {
public:
  HANDLE done=CreateEventW(nullptr, TRUE, FALSE, nullptr);
  HRESULT result=E_PENDING;
  ComPtr<IAudioClient> client;
  ~Activation() { if (done) CloseHandle(done); }
  STDMETHOD(ActivateCompleted)(IActivateAudioInterfaceAsyncOperation* operation) override {
    ComPtr<IUnknown> unknown; HRESULT activationResult=E_FAIL;
    result=operation->GetActivateResult(&activationResult, &unknown);
    if (SUCCEEDED(result)) result=activationResult;
    if (SUCCEEDED(result)) result=unknown.As(&client);
    SetEvent(done); return S_OK;
  }
};
static void u32(uint32_t n) { char b[4]; for (int i=0;i<4;++i) b[i]=char((n>>(i*8))&255); std::cout.write(b,4); }
static void emit(const std::string& meta, const BYTE* bytes, uint32_t size) {
  if (meta.size()>4096 || size>4*1024*1024) throw E_INVALIDARG;
  u32(static_cast<uint32_t>(meta.size())); u32(size); std::cout.write(meta.data(),static_cast<std::streamsize>(meta.size()));
  if(size) std::cout.write(reinterpret_cast<const char*>(bytes),size);
  std::cout.flush(); if(!std::cout) throw E_FAIL;
}
int wmain(int argc,wchar_t** argv) {
  // argv: owned root PID and exact creation FILETIME, both server supplied.
  if(argc!=3) return 2;
  HANDLE process=nullptr,event=nullptr; WAVEFORMATEX* format=nullptr;
  bool com=false,started=false; ComPtr<IAudioClient> client;
  try {
    wchar_t *pidEnd=nullptr,*timeEnd=nullptr;
    auto pidValue=wcstoull(argv[1],&pidEnd,10), creation=wcstoull(argv[2],&timeEnd,10);
    if(!pidValue||pidValue>MAXDWORD||!pidEnd||*pidEnd||!creation||!timeEnd||*timeEnd) throw E_INVALIDARG;
    process=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE,FALSE,static_cast<DWORD>(pidValue));
    FILETIME c{},e{},k{},u{};
    if(!process||!GetProcessTimes(process,&c,&e,&k,&u)||filetime(c)!=creation||WaitForSingleObject(process,0)!=WAIT_TIMEOUT) throw E_ACCESSDENIED;
    // Native API build check, unaffected by compatibility manifest version reporting.
    struct Version { ULONG size,major,minor,build,platform; WCHAR service[128]; } version{};
    version.size=static_cast<ULONG>(sizeof(version));
    using GetVersion=LONG(WINAPI*)(Version*);
    auto getVersion=std::bit_cast<GetVersion>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"),"RtlGetVersion"));
    if(!getVersion||getVersion(&version)!=0||version.build<20348) throw E_NOTIMPL;
    if(_setmode(_fileno(stdin),_O_BINARY)==-1||_setmode(_fileno(stdout),_O_BINARY)==-1)throw E_FAIL;
    std::array<char,32> nonce{}; DWORD nonceRead=0;
    while(nonceRead<nonce.size()) {DWORD count=0;if(!ReadFile(GetStdHandle(STD_INPUT_HANDLE),nonce.data()+nonceRead,static_cast<DWORD>(nonce.size())-nonceRead,&count,nullptr)||!count)throw E_ACCESSDENIED;nonceRead+=count;}
    static const char* hex="0123456789abcdef"; std::string token;
    for(unsigned char b:nonce) {token+=hex[b>>4];token+=hex[b&15];}
    check(CoInitializeEx(nullptr,COINIT_MULTITHREADED)); com=true;
    AUDIOCLIENT_ACTIVATION_PARAMS parameters{};
    parameters.ActivationType=AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
    parameters.ProcessLoopbackParams.TargetProcessId=static_cast<DWORD>(pidValue);
    parameters.ProcessLoopbackParams.ProcessLoopbackMode=PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
    PROPVARIANT property{}; property.vt=VT_BLOB; property.blob.cbSize=sizeof(parameters);
    property.blob.pBlobData=reinterpret_cast<BYTE*>(&parameters);
    auto completion=Microsoft::WRL::Make<Activation>(); if(!completion||!completion->done) throw E_OUTOFMEMORY;
    ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
    check(ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,__uuidof(IAudioClient),&property,completion.Get(),&operation));
    if(WaitForSingleObject(completion->done,10000)!=WAIT_OBJECT_0) throw E_ABORT;
    check(completion->result); client=completion->client;
    if(WaitForSingleObject(process,0)!=WAIT_TIMEOUT)throw E_ACCESSDENIED;
    check(client->GetMixFormat(&format));
    WORD tag=format->wFormatTag,bits=format->wBitsPerSample,channels=format->nChannels;
    if(tag==WAVE_FORMAT_EXTENSIBLE) {
      if(format->cbSize<22) throw E_INVALIDARG;
      auto ext=reinterpret_cast<WAVEFORMATEXTENSIBLE*>(format);
      if(ext->Samples.wValidBitsPerSample!=bits) throw E_NOTIMPL;
      if(IsEqualGUID(ext->SubFormat,KSDATAFORMAT_SUBTYPE_PCM)) tag=WAVE_FORMAT_PCM;
      else if(IsEqualGUID(ext->SubFormat,KSDATAFORMAT_SUBTYPE_IEEE_FLOAT)) tag=WAVE_FORMAT_IEEE_FLOAT;
      else throw E_NOTIMPL;
    }
    if(!channels||channels>8||!format->nSamplesPerSec||format->nSamplesPerSec>192000||
      !((tag==WAVE_FORMAT_PCM&&bits==16)||(tag==WAVE_FORMAT_IEEE_FLOAT&&bits==32))||
      format->nBlockAlign!=channels*(bits/8)) throw E_NOTIMPL;
    event=CreateEventW(nullptr,FALSE,FALSE,nullptr); if(!event) throw E_FAIL;
    check(client->Initialize(AUDCLNT_SHAREMODE_SHARED,AUDCLNT_STREAMFLAGS_LOOPBACK|AUDCLNT_STREAMFLAGS_EVENTCALLBACK,0,0,format,nullptr));
    check(client->SetEventHandle(event)); ComPtr<IAudioCaptureClient> capture; check(client->GetService(IID_PPV_ARGS(&capture)));
    LARGE_INTEGER frequency{}; if(!QueryPerformanceFrequency(&frequency)||frequency.QuadPart<=0) throw E_FAIL;
    std::ostringstream hello; hello<<"{\"kind\":\"hello\",\"nonce\":\""<<token<<"\",\"pid\":"<<pidValue<<",\"creationFiletime\":\""<<creation<<"\",\"osBuild\":"<<version.build<<",\"qpcFrequency\":\""<<frequency.QuadPart<<"\",\"sampleRate\":"<<format->nSamplesPerSec<<",\"channels\":"<<channels<<",\"format\":\""<<(tag==WAVE_FORMAT_PCM?"s16le":"f32le")<<"\"}";
    emit(hello.str(),nullptr,0);
    // Detached reader references only a shared flag, never stack state after exit.
    auto stop=std::make_shared<std::atomic<bool>>(false);
    std::thread([stop]{char ch;DWORD count=0;ReadFile(GetStdHandle(STD_INPUT_HANDLE),&ch,1,&count,nullptr);stop->store(true);}).detach();
    if(WaitForSingleObject(process,0)!=WAIT_TIMEOUT)throw E_ACCESSDENIED;
    check(client->Start()); started=true; uint64_t sequence=0;
    while(!stop->load()) {
      if(WaitForSingleObject(process,0)!=WAIT_TIMEOUT) throw E_ABORT;
      auto wait=WaitForSingleObject(event,250); if(wait==WAIT_TIMEOUT) continue; if(wait!=WAIT_OBJECT_0) throw E_FAIL;
      UINT32 available=0; check(capture->GetNextPacketSize(&available));
      while(available&&!stop->load()) {
        BYTE* bytes=nullptr; UINT32 frames=0; DWORD flags=0; UINT64 device=0,stamp=0;
        auto before=bracket(); check(capture->GetBuffer(&bytes,&frames,&flags,&device,&stamp)); auto after=bracket();
        if((flags&(AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR|AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY))||!frames||frames>4*1024*1024/format->nBlockAlign) {
          capture->ReleaseBuffer(frames); throw E_FAIL;
        }
        auto size=frames*format->nBlockAlign; std::vector<BYTE> packet(size);
        if(!(flags&AUDCLNT_BUFFERFLAGS_SILENT)) {if(!bytes) {capture->ReleaseBuffer(frames);throw E_FAIL;} memcpy(packet.data(),bytes,size);}
        check(capture->ReleaseBuffer(frames));
        std::ostringstream meta;
        meta<<"{\"kind\":\"packet\",\"nonce\":\""<<token<<"\",\"sequence\":"<<sequence++<<",\"devicePosition\":\""<<device<<"\",\"qpc100ns\":\""<<stamp<<"\",\"frames\":"<<frames<<",\"flags\":"<<flags
          <<",\"before\":{\"qpcBefore\":\""<<before.before<<"\",\"utcFiletime\":\""<<before.utc<<"\",\"qpcAfter\":\""<<before.after<<"\"},\"after\":{\"qpcBefore\":\""<<after.before<<"\",\"utcFiletime\":\""<<after.utc<<"\",\"qpcAfter\":\""<<after.after<<"\"}}";
        emit(meta.str(),packet.data(),size); check(capture->GetNextPacketSize(&available));
      }
    }
    check(client->Stop()); started=false;
    emit("{\"kind\":\"end\",\"nonce\":\""+token+"\",\"packets\":"+std::to_string(sequence)+"}",nullptr,0);
    CoTaskMemFree(format);CloseHandle(event);CloseHandle(process);client.Reset();CoUninitialize();return 0;
  } catch(...) {
    if(started&&client) client->Stop(); if(format) CoTaskMemFree(format);
    if(event) CloseHandle(event); if(process) CloseHandle(process); client.Reset(); if(com) CoUninitialize();
    return 3; // fixed failure; no private payload in stderr
  }
}
