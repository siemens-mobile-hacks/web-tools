import {Component, createEffect, createSignal, onCleanup, onMount} from 'solid-js';
import {Box, Button, LinearProgress, Link, Typography, useTheme} from '@suid/material';
import {FFmpeg, type FileData, type LogEvent, type ProgressEvent} from '@ffmpeg/ffmpeg';
import {PageTitle} from "@/components/Layout/PageTitle";
import ffmpegCoreJavascriptUrl from '@ffmpeg/core?url';
import ffmpegCoreWasmUrl from '@ffmpeg/core/wasm?url';

export const VideoConverterPage: Component = () => {
    const [userSelectedFile, setUserSelectedFile] = createSignal<File | null>(null);
    const [isEngineLoadingOrBusy, setIsEngineLoadingOrBusy] = createSignal(false);
    const [isEngineLoaded, setIsEngineLoaded] = createSignal(false);
    const [conversionProgressRatio, setConversionProgressRatio] = createSignal(0);
    const [isProgressVisible, setIsProgressVisible] = createSignal(false);
    const [logTextContent, setLogTextContent] = createSignal('');
    const [downloadObjectUrl, setDownloadObjectUrl] = createSignal<string | null>(null);
    const [outputPath, setOutputPath] = createSignal('');
    const totalPipelinePassCount = 2; // maps per-pass progress (0..1) across two passes
    let currentPassZeroBasedIndex = 0; // 0 for pass 1, 1 for pass 2
    const theme = useTheme();

    let logPreElement: HTMLPreElement | undefined;
    let scheduledScrollAnimationFrameId: number | null = null;
    let logResizeObserver: ResizeObserver | null = null;

    const [shouldStickToBottom, setShouldStickToBottom] = createSignal(true);
    let isPointerPressedInsideLogPreElement = false;
    const bottomSnapThresholdPixels = 24;

    function scheduleScrollToBottomIfNeeded() {
        if (!shouldStickToBottom() || !logPreElement) return;
        if (scheduledScrollAnimationFrameId !== null) cancelAnimationFrame(scheduledScrollAnimationFrameId);
        scheduledScrollAnimationFrameId = requestAnimationFrame(() => {
            scheduledScrollAnimationFrameId = null;
            logPreElement!.scrollTop = logPreElement!.scrollHeight;
        });
    }

    function updateStickinessFromScrollPosition() {
        if (!logPreElement) return;
        const distanceFromBottom = logPreElement.scrollHeight - logPreElement.scrollTop - logPreElement.clientHeight;
        if (isPointerPressedInsideLogPreElement) {
            setShouldStickToBottom(false);
            return;
        }
        setShouldStickToBottom(distanceFromBottom <= bottomSnapThresholdPixels);
    }

    function fileDataToBlobPart(extractedFileData: FileData): BlobPart {
        if (typeof extractedFileData === 'string') return extractedFileData;
        const fullBuffer = extractedFileData.buffer as ArrayBuffer;
        const exactRegion = fullBuffer.slice(
            extractedFileData.byteOffset,
            extractedFileData.byteOffset + extractedFileData.byteLength
        );
        return exactRegion;
    }

    createEffect(() => {
        logTextContent();
        scheduleScrollToBottomIfNeeded();
    });

    onMount(() => {
        void loadFFmpegEngine(); // existing
        if (logPreElement) {
            logResizeObserver = new ResizeObserver(() => {
                scheduleScrollToBottomIfNeeded();
            });
            logResizeObserver.observe(logPreElement);
        }
    });

    onCleanup(() => {
        if (scheduledScrollAnimationFrameId !== null) cancelAnimationFrame(scheduledScrollAnimationFrameId);
        logResizeObserver?.disconnect();
        const url = downloadObjectUrl();
        if (url) URL.revokeObjectURL(url);
        void ffmpegEngineInstance.terminate();
    });

    const ffmpegEngineInstance = new FFmpeg();

    let ffmpegLoadPromise: Promise<void> | null = null;

    function appendLogAndScroll(nonAnsiText: string) {
        const sanitized = nonAnsiText.replace(/\u001b\[[0-9;]*m/g, '');
        setLogTextContent(prev => prev + sanitized + '\n');
    }

    const handleFfmpegLogEvent = ({message}: LogEvent) => appendLogAndScroll(message);
    const handleFfmpegProgressEvent = ({progress}: ProgressEvent) => {
        setIsProgressVisible(true);
        const perPassProgressClamped = Math.max(0, Math.min(1, progress ?? 0));
        const overallProgress =
            currentPassZeroBasedIndex / totalPipelinePassCount +
            perPassProgressClamped / totalPipelinePassCount;
        setConversionProgressRatio(overallProgress);
    };


    async function loadFfmpegEngineOnce() {
        if (ffmpegEngineInstance.loaded) return;
        if (ffmpegLoadPromise !== null) return ffmpegLoadPromise;

        ffmpegEngineInstance.on('log', handleFfmpegLogEvent);
        ffmpegEngineInstance.on('progress', handleFfmpegProgressEvent);
        appendLogAndScroll('Loading FFmpeg worker...');

        ffmpegLoadPromise = ffmpegEngineInstance
            .load({
                coreURL: ffmpegCoreJavascriptUrl,
                wasmURL: ffmpegCoreWasmUrl,
            })
            .then(() => {
                appendLogAndScroll('FFmpeg loaded.');
                setIsEngineLoaded(true);
            })
            .finally(() => {
                // allow a future reload() if you ever terminate the worker
                ffmpegLoadPromise = null;
            });

        return ffmpegLoadPromise;
    }

    async function loadFFmpegEngine() {
        setIsEngineLoadingOrBusy(true);
        try {
            await loadFfmpegEngineOnce();
        } catch (e) {
            appendLogAndScroll(`Engine failed to load: ${String((e as Error)?.message ?? e)}`);
        } finally {
            setIsEngineLoadingOrBusy(false);
        }
    }

    async function readAsUint8Array(selectedFile: File) {
        const arrayBuffer = await selectedFile.arrayBuffer();
        return new Uint8Array(arrayBuffer);
    }

    async function runTwoPassThreeGpPipeline(inputVirtualPath: string, outputVirtualPath: string) {
        const videoFilterChain =
            'scale=320:240:force_original_aspect_ratio=decrease,pad=320:240:(ow-iw)/2:(oh-ih)/2,setsar=1';

        const pass1Arguments = [
            '-y',
            '-i',
            inputVirtualPath,
            '-vf',
            videoFilterChain,
            '-c:v',
            'mpeg4',
            '-pix_fmt',
            'yuv420p',
            '-tag:v',
            'mp4v',
            '-threads',
            '1',
            '-slices',
            '1',
            '-bf',
            '0',
            '-r',
            '14.5',
            '-vsync',
            'cfr',
            '-g',
            '72',
            '-keyint_min',
            '1',
            '-sc_threshold',
            '100',
            '-i_qfactor',
            '0.5',
            '-i_qoffset',
            '-1.0',
            '-qcomp',
            '0.80',
            '-qmin',
            '2',
            '-qmax',
            '31',
            '-mbd',
            'rd',
            '-subq',
            '7',
            '-me_method',
            'umh',
            '-me_range',
            '32',
            '-b:v',
            '185k',
            '-maxrate',
            '190k',
            '-bufsize',
            '40000k',
            '-rc_init_occupancy',
            '30000k',
            '-trellis',
            '2',
            '-pass',
            '1',
            '-passlogfile',
            'mp4v_pass',
            '-an',
            '-f',
            'null',
            '/dev/null',
        ];

        const pass2Arguments = [
            '-y',
            '-i',
            inputVirtualPath,
            '-vf',
            videoFilterChain,
            '-c:v',
            'mpeg4',
            '-pix_fmt',
            'yuv420p',
            '-tag:v',
            'mp4v',
            '-threads',
            '1',
            '-slices',
            '1',
            '-bf',
            '0',
            '-r',
            '14.5',
            '-vsync',
            'cfr',
            '-g',
            '72',
            '-keyint_min',
            '1',
            '-sc_threshold',
            '100',
            '-i_qfactor',
            '0.5',
            '-i_qoffset',
            '-1.0',
            '-qcomp',
            '0.80',
            '-qmin',
            '2',
            '-qmax',
            '31',
            '-mbd',
            'rd',
            '-subq',
            '7',
            '-me_method',
            'umh',
            '-me_range',
            '32',
            '-b:v',
            '185k',
            '-maxrate',
            '190k',
            '-bufsize',
            '40000k',
            '-rc_init_occupancy',
            '30000k',
            '-trellis',
            '2',
            '-pass',
            '2',
            '-passlogfile',
            'mp4v_pass',
            '-c:a',
            'aac',
            '-profile:a',
            'aac_low',
            '-b:a',
            '88k',
            '-ar',
            '44100',
            '-ac',
            '2',
            '-movflags',
            '+faststart',
            '-video_track_timescale',
            '29',
            outputVirtualPath,
        ];

        appendLogAndScroll('\n— PASS 1 —');
        currentPassZeroBasedIndex = 0;
        await ffmpegEngineInstance.exec(pass1Arguments);
        appendLogAndScroll('\n— PASS 2 —');
        currentPassZeroBasedIndex = 1;
        await ffmpegEngineInstance.exec(pass2Arguments);
        setConversionProgressRatio(1);
    }

    async function handleConvertClick() {
        const selectedFile = userSelectedFile();
        if (!selectedFile) {
            alert('Pick a video file first.');
            return;
        }

        setIsEngineLoadingOrBusy(true);
        setIsProgressVisible(false);
        setConversionProgressRatio(0);
        const previousUrl = downloadObjectUrl();
        if (previousUrl) {
            URL.revokeObjectURL(previousUrl);
            setDownloadObjectUrl(null);
        }

        try {
            await loadFfmpegEngineOnce();

            const inputPath = selectedFile.name;
            let outputFileName = selectedFile.name.replace(/\.[^/.]+$/, '.3gp');
            setOutputPath(outputFileName);
            const inputBytes = await readAsUint8Array(selectedFile);

            appendLogAndScroll(`Writing ${selectedFile.name} to in-memory FS...`);
            await ffmpegEngineInstance.writeFile(inputPath, inputBytes);
            currentPassZeroBasedIndex = 0;
            await runTwoPassThreeGpPipeline(inputPath, outputFileName);

            const extractedFileData = await ffmpegEngineInstance.readFile(outputFileName);
            const downloadContentType = navigator.userAgent.toLowerCase().includes('firefox')
                ? 'application/octet-stream'
                : 'video/3gpp';

            const outputBlob = new Blob([fileDataToBlobPart(extractedFileData)], {type: downloadContentType});
            const outputHref = URL.createObjectURL(outputBlob);
            setDownloadObjectUrl(outputHref);

            appendLogAndScroll('\nDone. Click the link at the top to download your 3GP file.');
        } catch (err) {
            appendLogAndScroll(`\nConversion failed: ${String((err as Error)?.message ?? err)}`);
        } finally {
            setIsEngineLoadingOrBusy(false);
            setIsProgressVisible(false);
        }
    }

    onCleanup(() => {
        const url = downloadObjectUrl();
        if (url) URL.revokeObjectURL(url);
    });

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                height: 'calc(100dvh - 100px)',
                gap: 1.5,
            }}
        >
            <PageTitle>Video Converter</PageTitle>

            <Box
                class="row"
                sx={{
                    display: 'flex',
                    gap: 1.5,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    my: 2,
                    flex: '0 0 auto',
                }}
            >
                <Button
                    variant="contained"
                    component="label"
                    disabled={isEngineLoadingOrBusy()}
                >
                    <>{userSelectedFile() ? 'Choose another video' : 'Choose video'}</>
                    <input
                        id="fileInput"
                        type="file"
                        accept="video/*"
                        onChange={(e) => setUserSelectedFile(e.currentTarget.files?.[0] ?? null)}
                        hidden
                    />
                </Button>
                {userSelectedFile() && (
                    <Typography variant="body2" sx={{ml: 0.5}}>
                        {userSelectedFile()!.name}
                    </Typography>
                )}
                <Button
                    variant="contained"
                    onClick={handleConvertClick}
                    disabled={!isEngineLoaded() || !userSelectedFile() || isEngineLoadingOrBusy()}
                >
                    Convert to 320×240 3GP
                </Button>

                {isProgressVisible() && (
                    <Box sx={{minWidth: 280, display: 'flex', alignItems: 'center', gap: 1}}>
                        <Box sx={{flexGrow: 1}}>
                            <LinearProgress
                                variant="determinate"
                                value={Math.max(0, Math.min(100, conversionProgressRatio() * 100))}
                            />
                        </Box>
                        <Typography variant="caption" sx={{minWidth: 42, textAlign: 'right'}}>
                            {Math.round((conversionProgressRatio() || 0) * 100)}%
                        </Typography>
                    </Box>
                )}

                {downloadObjectUrl() && (
                    <Link
                        id="downloadLink"
                        href={downloadObjectUrl()!}
                        download={outputPath()}
                        underline="hover"
                        sx={{ml: 1}}
                    >
                        Download {outputPath()}
                    </Link>
                )}
            </Box>
            <Box
                component="pre"
                id="log"
                aria-live="polite"
                ref={(el) => {
                    logPreElement = el as HTMLPreElement;
                }}
                onScroll={updateStickinessFromScrollPosition}
                onPointerDown={() => {
                    isPointerPressedInsideLogPreElement = true;
                    setShouldStickToBottom(false);
                }}
                onPointerUp={() => {
                    isPointerPressedInsideLogPreElement = false;
                    updateStickinessFromScrollPosition();
                }}
                onPointerCancel={() => {
                    isPointerPressedInsideLogPreElement = false;
                    updateStickinessFromScrollPosition();
                }}
                sx={{
                    background: theme.palette.mode === 'light' ? theme.palette.grey[100] : theme.palette.grey[900],
                    color: theme.palette.text.primary,
                    p: 1.5,
                    borderRadius: 1,
                    flex: '1 1 auto',
                    minHeight: 0,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                }}
            >
                {logTextContent()}
            </Box>
        </Box>
    );
};

export default VideoConverterPage;
