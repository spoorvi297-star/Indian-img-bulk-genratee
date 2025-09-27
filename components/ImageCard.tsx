import React from 'react';
import { ImageResult, ImageResultStatus } from '../types';
import Spinner from './Spinner';
import { Icon } from './Icons';
import { slugify } from '../utils';

interface ImageCardProps {
  result: ImageResult;
}

const ImageCard: React.FC<ImageCardProps> = ({ result }) => {
  const { status, imageUrl, prompt, error } = result;

  const renderContent = () => {
    switch (status) {
      case ImageResultStatus.LOADING:
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <Spinner />
            <p className="mt-4 text-sm text-gray-400">Generating...</p>
          </div>
        );
      case ImageResultStatus.SUCCESS:
        return (
          <div className="relative w-full h-full group">
            <img
              src={imageUrl}
              alt={prompt}
              className="w-full h-full object-cover"
            />
            <a
              href={imageUrl}
              download={`${slugify(prompt)}.png`}
              className="absolute top-3 right-3 bg-gray-900 bg-opacity-60 p-2 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 focus:opacity-100 hover:bg-opacity-80"
              aria-label={`Download image for prompt: ${prompt}`}
              title="Download Image"
            >
              <Icon type="download" className="h-5 w-5" />
            </a>
          </div>
        );
      case ImageResultStatus.ERROR:
        return (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <Icon type="error" className="h-12 w-12 text-red-400" />
            <p className="mt-2 text-sm font-semibold text-red-400">Generation Failed</p>
            <p className="mt-1 text-xs text-gray-400 break-words">{error}</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden flex flex-col transition-all duration-300 aspect-square">
        <div className="flex-grow relative">
          {renderContent()}
        </div>
        <div className="p-3 bg-gray-800/50">
            <p className="text-xs text-gray-400 truncate" title={prompt}>
                {prompt}
            </p>
        </div>
    </div>
  );
};

export default ImageCard;
