
import React, { useState, useCallback, useMemo } from 'react';
import JSZip from 'jszip';
import { generateImage, AspectRatio } from './services/geminiService';
import { ImageResult, ImageResultStatus } from './types';
import ImageCard from './components/ImageCard';
import { slugify } from './utils';
import { Icon } from './components/Icons';

const App: React.FC = () => {
  const [prompts, setPrompts] = useState<string>('');
  const [characterDescription, setCharacterDescription] = useState<string>('');
  const [results, setResults] = useState<ImageResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);

  const aspectRatios: AspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "3:4"];

  const handleGenerate = useCallback(async () => {
    let promptList = prompts
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (promptList.length === 0) {
      return;
    }
    
    const trimmedCharDesc = characterDescription.trim();
    if (trimmedCharDesc) {
      promptList = promptList.map(prompt => `${trimmedCharDesc}, ${prompt}`);
    }

    setIsLoading(true);
    setProgress({ completed: 0, total: promptList.length });

    const initialResults: ImageResult[] = promptList.map((prompt, index) => ({
      id: self.crypto.randomUUID(),
      // Store the original prompt without the character description for display
      prompt: prompts.split('\n').map((p) => p.trim()).filter((p) => p.length > 0)[index],
      status: ImageResultStatus.LOADING,
    }));
    setResults(initialResults);

    const CONCURRENCY_LIMIT = 5;

    const tasks = initialResults.map((result, index) => () =>
      generateImage(promptList[index], aspectRatio)
        .then((imageUrl) => {
          setResults((prev) =>
            prev.map((r) =>
              r.id === result.id
                ? { ...r, status: ImageResultStatus.SUCCESS, imageUrl }
                : r
            )
          );
        })
        .catch((error) => {
          setResults((prev) =>
            prev.map((r) =>
              r.id === result.id
                ? {
                    ...r,
                    status: ImageResultStatus.ERROR,
                    error:
                      error instanceof Error
                        ? error.message
                        : 'An unknown error occurred.',
                  }
                : r
            )
          );
        })
        .finally(() => {
          setProgress((prevProgress) => {
            if (!prevProgress) return null;
            return { ...prevProgress, completed: prevProgress.completed + 1 };
          });
        })
    );
    
    const executing = new Set<Promise<void>>();
    for (const task of tasks) {
      const promise = task();
      executing.add(promise);
      promise.finally(() => {
        executing.delete(promise);
      });
      if (executing.size >= CONCURRENCY_LIMIT) {
        await Promise.race(executing);
      }
    }
    
    await Promise.allSettled([...executing]);

    setIsLoading(false);
  }, [prompts, aspectRatio, characterDescription]);
  
  const handleRetryFailed = useCallback(async () => {
    const failedResults = results.filter(r => r.status === ImageResultStatus.ERROR);
    if (failedResults.length === 0) {
        return;
    }

    setIsLoading(true);
    setProgress({ completed: 0, total: failedResults.length });

    // Reset status of failed items to LOADING
    setResults(prev => 
        prev.map(r => 
            r.status === ImageResultStatus.ERROR ? { ...r, status: ImageResultStatus.LOADING, error: undefined } : r
        )
    );

    const trimmedCharDesc = characterDescription.trim();
    const promptsToRetry = failedResults.map(result => {
        const originalPrompt = result.prompt;
        return trimmedCharDesc ? `${trimmedCharDesc}, ${originalPrompt}` : originalPrompt;
    });

    const CONCURRENCY_LIMIT = 5;

    const tasks = failedResults.map((result, index) => () =>
        generateImage(promptsToRetry[index], aspectRatio)
            .then((imageUrl) => {
                setResults((prev) =>
                    prev.map((r) =>
                        r.id === result.id ? { ...r, status: ImageResultStatus.SUCCESS, imageUrl } : r
                    )
                );
            })
            .catch((error) => {
                setResults((prev) =>
                    prev.map((r) =>
                        r.id === result.id ? {
                            ...r,
                            status: ImageResultStatus.ERROR,
                            error: error instanceof Error ? error.message : 'An unknown error occurred.',
                        } : r
                    )
                );
            })
            .finally(() => {
                setProgress((prevProgress) => {
                    if (!prevProgress) return null;
                    return { ...prevProgress, completed: prevProgress.completed + 1 };
                });
            })
    );

    const executing = new Set<Promise<void>>();
    for (const task of tasks) {
        const promise = task();
        executing.add(promise);
        promise.finally(() => {
            executing.delete(promise);
        });
        if (executing.size >= CONCURRENCY_LIMIT) {
            await Promise.race(executing);
        }
    }
    
    await Promise.allSettled([...executing]);

    setIsLoading(false);
  }, [results, aspectRatio, characterDescription]);

  const handleDownloadAll = useCallback(async () => {
    setIsZipping(true);
    const zip = new JSZip();
    const successfulResults = results.filter(r => r.status === ImageResultStatus.SUCCESS && r.imageUrl);

    const imagePromises = successfulResults.map(async (result) => {
        try {
            // Fetch the image data, which is a base64 data URL
            const response = await fetch(result.imageUrl!);
            const blob = await response.blob();
            const filename = `${slugify(result.prompt)}.png`;
            zip.file(filename, blob);
        } catch (e) {
            console.error(`Failed to fetch and add image for prompt: ${result.prompt}`, e);
        }
    });

    await Promise.all(imagePromises);

    try {
        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = 'bulk-images.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    } catch (e) {
        console.error("Failed to generate zip file", e);
    } finally {
        setIsZipping(false);
    }
  }, [results]);

  const successfulImageCount = useMemo(() => {
    return results.filter(r => r.status === ImageResultStatus.SUCCESS).length;
  }, [results]);

  const failedImageCount = useMemo(() => {
    return results.filter(r => r.status === ImageResultStatus.ERROR).length;
  }, [results]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">
            Bulk Image Generator
          </h1>
          <p className="mt-3 text-lg text-gray-400 max-w-2xl mx-auto">
            Enter multiple prompts, one per line, and generate all images in one go with Gemini.
          </p>
        </header>

        <main>
          <div className="bg-gray-800/50 p-6 rounded-xl shadow-2xl border border-gray-700 max-w-2xl mx-auto mb-10">
            <textarea
              value={prompts}
              onChange={(e) => setPrompts(e.target.value)}
              placeholder="A futuristic cityscape at sunset...
A majestic lion with a cosmic mane...
A tranquil forest with glowing mushrooms..."
              className="w-full h-40 p-4 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200 resize-none placeholder-gray-500"
              disabled={isLoading}
            />
             <div className="mt-4">
              <label htmlFor="character-description" className="block text-sm font-medium text-gray-400 mb-2">
                Character Lock (Optional)
              </label>
              <textarea
                id="character-description"
                value={characterDescription}
                onChange={(e) => setCharacterDescription(e.target.value)}
                placeholder="For a consistent character, describe their appearance in detail. e.g., 'A man with short brown hair, a beard, wearing glasses and a red flannel shirt.'"
                className="w-full h-24 p-4 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200 resize-none placeholder-gray-500"
                disabled={isLoading}
              />
              <p className="mt-1 text-xs text-gray-500">This description will be added to every prompt to maintain character consistency.</p>
            </div>
            <div className="mt-4">
              <label htmlFor="aspect-ratio" className="block text-sm font-medium text-gray-400 mb-2">
                Aspect Ratio
              </label>
              <select
                id="aspect-ratio"
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                disabled={isLoading}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {aspectRatios.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleGenerate}
              disabled={isLoading || !prompts.trim()}
              className="mt-4 w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="http://www.w3.org/2000/svg">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {progress ? `Generating... (${progress.completed}/${progress.total})` : 'Initializing...'}
                </>
              ) : `Generate ${prompts.split('\n').filter(p => p.trim()).length || 0} Images`}
            </button>
          </div>

          {results.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-300">Results</h2>
                  <div className="flex items-center gap-4">
                    {failedImageCount > 0 && !isLoading && (
                        <button
                            onClick={handleRetryFailed}
                            disabled={isLoading}
                            className="flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-yellow-500 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all duration-200"
                        >
                            <Icon type="retry" className="h-5 w-5 mr-2" />
                            Retry Failed ({failedImageCount})
                        </button>
                    )}
                    {successfulImageCount > 0 && (
                        <button
                            onClick={handleDownloadAll}
                            disabled={isZipping}
                            className="flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all duration-200"
                        >
                            {isZipping ? (
                                <>
                                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="http://www.w3.org/2000/svg">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  Zipping...
                                </>
                            ) : (
                                <>
                                  <Icon type="download" className="h-5 w-5 mr-2" />
                                  Download All ({successfulImageCount}) as .zip
                                </>
                            )}
                        </button>
                    )}
                  </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {results.map((result) => (
                  <ImageCard key={result.id} result={result} />
                ))}
              </div>
            </div>
          )}
           {results.length === 0 && !isLoading && (
             <div className="text-center py-16 px-4 border-2 border-dashed border-gray-700 rounded-lg">
                <svg className="mx-auto h-12 w-12 text-gray-500" fill="none" viewBox="http://www.w3.org/2000/svg" stroke="currentColor" aria-hidden="true">
                    <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-300">No images generated yet</h3>
                <p className="mt-1 text-sm text-gray-500">Your generated images will appear here.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;