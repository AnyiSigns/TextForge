'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageCircle, Trash2, Images, Sparkles } from 'lucide-react';
import { Character } from '@/types';
import { CharacterStudioSheet } from './CharacterStudioSheet';

interface Props {
  character: Character;
  onDelete: (id: string) => void;
}

export function CharacterCard({ character, onDelete }: Props) {
  const images = character.images ?? [];
  const [askStudio, setAskStudio] = useState(false);

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <Avatar className="w-12 h-12 border-2 border-border">
            <AvatarImage src={character.avatar} />
            <AvatarFallback className="text-lg">{character.name.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg">{character.name}</CardTitle>
            {character.novelId && (
              <Badge variant="outline" className="text-xs gap-1 mt-0.5">已关联小说</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{character.description}</p>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" className="flex-1">
            <Link href={`/characters/${character.id}/chat`}>
              <MessageCircle className="w-4 h-4 mr-2" /> 开始对话
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            title="生成立绘"
            onClick={() => setAskStudio(true)}
          >
            <Sparkles className="w-4 h-4 mr-1.5" /> 生成立绘
          </Button>
          {images.length > 0 && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Images className="w-3 h-3" /> {images.length}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(character.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>

      <CharacterStudioSheet character={character} open={askStudio} onOpenChange={setAskStudio} />
    </Card>
  );
}
